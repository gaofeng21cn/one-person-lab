function normalizeError(err) {
  if (!err || typeof err !== "object") return err;
  return {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: err.stack,
  };
}

export default async function* ndjsonReporter(source) {
  for await (const event of source) {
    if (event.type === "test:pass" || event.type === "test:fail" || event.type === "test:summary") {
      const data = event.data ? { ...event.data } : {};
      if (data.details && typeof data.details === "object" && data.details.error) {
        data.details = {
          ...data.details,
          error: normalizeError(data.details.error),
        };
      }
      yield JSON.stringify({ type: event.type, data }) + "\n";
    }
  }
}
