#!/bin/zsh
set -euo pipefail

APP_PATH=""
DMG_PATH=""
VOLUME_NAME=""
SIGNING_IDENTITY=""
NOTARY_PROFILE=""
NOTARY_KEYCHAIN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP_PATH="$2"
      shift 2
      ;;
    --dmg)
      DMG_PATH="$2"
      shift 2
      ;;
    --volume-name)
      VOLUME_NAME="$2"
      shift 2
      ;;
    --signing-identity)
      SIGNING_IDENTITY="$2"
      shift 2
      ;;
    --notary-profile)
      NOTARY_PROFILE="$2"
      shift 2
      ;;
    --notary-keychain)
      NOTARY_KEYCHAIN="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "Signed app bundle not found: ${APP_PATH:-<empty>}" >&2
  exit 1
fi
if [[ -z "$DMG_PATH" || -z "$VOLUME_NAME" || -z "$SIGNING_IDENTITY" || -z "$NOTARY_PROFILE" ]]; then
  echo "--app, --dmg, --volume-name, --signing-identity, and --notary-profile are required." >&2
  exit 1
fi
if [[ "$SIGNING_IDENTITY" == "-" ]]; then
  echo "Developer ID signing identity is required for notarization." >&2
  exit 1
fi

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/opl-macos-notary.XXXXXX")"
APP_ZIP="$TEMP_ROOT/app.zip"
DMG_STAGING="$TEMP_ROOT/dmg-staging"
cleanup() {
  rm -rf "${TEMP_ROOT:?}"
}
trap cleanup EXIT INT TERM

NOTARY_ARGS=(--keychain-profile "$NOTARY_PROFILE")
if [[ -n "$NOTARY_KEYCHAIN" ]]; then
  NOTARY_ARGS+=(--keychain "$NOTARY_KEYCHAIN")
fi

submit_and_wait() {
  local artifact="$1"
  local label="$2"
  local submit_plist="$TEMP_ROOT/$label-submit.plist"
  local result_plist="$TEMP_ROOT/$label-result.plist"
  local submission_id
  local wait_status

  xcrun notarytool submit "$artifact" \
    "${NOTARY_ARGS[@]}" \
    --output-format plist >"$submit_plist"
  submission_id="$(plutil -extract id raw -o - "$submit_plist")"
  echo "$label notarization submitted: $submission_id" >&2

  set +e
  xcrun notarytool wait "$submission_id" \
    "${NOTARY_ARGS[@]}" \
    --timeout 30m \
    --output-format plist >"$result_plist"
  wait_status=$?
  set -e

  if [[ "$wait_status" -ne 0 ]]; then
    xcrun notarytool info "$submission_id" \
      "${NOTARY_ARGS[@]}" \
      --output-format plist >"$result_plist" || true
  fi

  local notary_status
  notary_status="$(plutil -extract status raw -o - "$result_plist")"
  if [[ "$notary_status" != "Accepted" ]]; then
    echo "$label notarization $submission_id is not accepted; current status: $notary_status." >&2
    plutil -p "$result_plist" >&2
    exit 1
  fi
  echo "$submission_id"
}

ditto -c -k --keepParent "$APP_PATH" "$APP_ZIP"
APP_SUBMISSION_ID="$(submit_and_wait "$APP_ZIP" app)"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

mkdir -p "$DMG_STAGING" "${DMG_PATH:h}"
APP_BASENAME="${APP_PATH:t}"
ditto "$APP_PATH" "$DMG_STAGING/$APP_BASENAME"
ln -s /Applications "$DMG_STAGING/Applications"

CHECKSUM_PATH="$DMG_PATH.sha256"
rm -f "$DMG_PATH" "$CHECKSUM_PATH"
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$DMG_STAGING" \
  -format UDZO \
  -ov \
  "$DMG_PATH"
hdiutil verify "$DMG_PATH"

codesign --force --sign "$SIGNING_IDENTITY" --timestamp "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"

DMG_SUBMISSION_ID="$(submit_and_wait "$DMG_PATH" dmg)"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

(
  cd "${DMG_PATH:h}"
  shasum -a 256 "${DMG_PATH:t}" >"${CHECKSUM_PATH:t}"
)

echo "App notarization accepted: $APP_SUBMISSION_ID"
echo "DMG notarization accepted: $DMG_SUBMISSION_ID"
echo "$DMG_PATH"
echo "$CHECKSUM_PATH"
