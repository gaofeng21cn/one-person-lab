import { spawnSync } from 'node:child_process';
import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-renderer-'));
  const input = path.join(root, 'input');
  const output = path.join(root, 'output');
  fs.mkdirSync(input);
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(input, 'minimal.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>');
  const request = path.join(root, 'request.json');
  return { root, input, output, request };
}

function writeRequest(value: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) {
  fs.writeFileSync(value.request, JSON.stringify({
    surface_kind: 'opl_stage_native_renderer_request',
    schema_version: 'stage-native-renderer.v1',
    stage_run_id: 'stage-run-test',
    attempt_id: 'attempt-test',
    capability_ref: 'macos.native_renderer',
    tool: 'qlmanage',
    cwd: value.root,
    input_root: value.input,
    output_root: value.output,
    argv: ['-t', '-s', '16', '-o', value.output, path.join(value.input, 'minimal.svg')],
    timeout_seconds: 30,
    ...patch,
  }));
}

test('pack native-helper render executes allowlisted qlmanage through native_helper_carrier', { skip: !fs.existsSync('/usr/bin/qlmanage') }, () => {
  const value = fixture();
  try {
    writeRequest(value);
    const receipt = runCli(['pack', 'native-helper', 'render', '--request', value.request]).native_renderer_execution_receipt;
    assert.equal(receipt.status, 'executed');
    assert.equal(receipt.tool, 'qlmanage');
    assert.equal(receipt.stage_run_id, 'stage-run-test');
    assert.equal(receipt.attempt_id, 'attempt-test');
    assert.equal(receipt.carrier.role, 'native_helper_carrier');
    assert.equal(receipt.carrier.execution_route, 'opl_runway/native_helper_carrier');
    assert.equal(receipt.carrier.entered_codex_seatbelt, false);
    assert.equal(receipt.authority_boundary.can_authorize_visual_quality, false);
    assert.equal(fs.existsSync(path.join(value.output, 'minimal.svg.png')), true);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper render rejects non-allowlisted tools and undeclared env', () => {
  const value = fixture();
  try {
    writeRequest(value, { tool: 'sh' });
    assert.equal(runCliFailure(['pack', 'native-helper', 'render', '--request', value.request]).payload.error.code, 'contract_shape_invalid');
    writeRequest(value, { env: { OPL_ARBITRARY_EXECUTABLE: 'sh' } });
    assert.equal(runCliFailure(['pack', 'native-helper', 'render', '--request', value.request]).payload.error.code, 'contract_shape_invalid');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper render rejects path traversal and symlink roots/files', () => {
  const value = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-renderer-outside-'));
  try {
    writeRequest(value, { argv: ['-t', '-o', outside, path.join(value.input, 'minimal.svg')] });
    assert.equal(runCliFailure(['pack', 'native-helper', 'render', '--request', value.request]).payload.error.code, 'contract_shape_invalid');
    writeRequest(value, { argv: ['-t', '-o', value.output, '../outside.svg'] });
    assert.equal(runCliFailure(['pack', 'native-helper', 'render', '--request', value.request]).payload.error.code, 'contract_shape_invalid');
    const linkedRoot = path.join(value.root, 'linked-output');
    fs.symlinkSync(value.output, linkedRoot);
    writeRequest(value, { output_root: linkedRoot });
    assert.equal(runCliFailure(['pack', 'native-helper', 'render', '--request', value.request]).payload.error.code, 'contract_shape_invalid');
    const linkedInput = path.join(value.input, 'linked.svg');
    fs.symlinkSync(path.join(value.input, 'minimal.svg'), linkedInput);
    writeRequest(value, { argv: ['-t', '-o', value.output, linkedInput] });
    assert.equal(runCliFailure(['pack', 'native-helper', 'render', '--request', value.request]).payload.error.code, 'contract_shape_invalid');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});


test('pack native-helper render converts a minimal DOCX through allowlisted soffice', { skip: !fs.existsSync('/Applications/LibreOffice.app/Contents/MacOS/soffice') }, () => {
  const value = fixture();
  try {
    const docx = path.join(value.input, 'minimal.docx');
    const script = [
      'import sys, zipfile',
      'p=sys.argv[1]',
      'with zipfile.ZipFile(p, "w") as z:',
      ' z.writestr("[Content_Types].xml", "<?xml version=\\"1.0\\"?><Types xmlns=\\"http://schemas.openxmlformats.org/package/2006/content-types\\"><Default Extension=\\"rels\\" ContentType=\\"application/vnd.openxmlformats-package.relationships+xml\\"/><Default Extension=\\"xml\\" ContentType=\\"application/xml\\"/><Override PartName=\\"/word/document.xml\\" ContentType=\\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\\"/></Types>")',
      ' z.writestr("_rels/.rels", "<?xml version=\\"1.0\\"?><Relationships xmlns=\\"http://schemas.openxmlformats.org/package/2006/relationships\\"><Relationship Id=\\"rId1\\" Type=\\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\\" Target=\\"word/document.xml\\"/></Relationships>")',
      ' z.writestr("word/document.xml", "<?xml version=\\"1.0\\"?><w:document xmlns:w=\\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\\"><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>")',
    ].join('\n');
    const generated = spawnSync('/usr/bin/python3', ['-c', script, docx], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    writeRequest(value, {
      tool: 'soffice',
      argv: ['--headless', '--convert-to', 'pdf', '--outdir', value.output, docx],
    });
    const receipt = runCli(['pack', 'native-helper', 'render', '--request', value.request]).native_renderer_execution_receipt;
    assert.equal(receipt.status, 'executed');
    assert.equal(receipt.tool, 'soffice');
    assert.equal(fs.existsSync(path.join(value.output, 'minimal.pdf')), true);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('pack native-helper render is discoverable under Pack help', () => {
  const help = runCli(['help', 'pack', 'native-helper']).help;
  assert.equal(help.subcommands.some((entry: { command: string }) => entry.command === 'pack native-helper render'), true);
});
