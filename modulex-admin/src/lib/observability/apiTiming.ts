import "server-only";

export type ApiTimingContext = {
  route: string;
  method: string;
};

type TimingEvent = {
  event: "modulex_api_timing";
  route: string;
  method: string;
  status: number;
  duration_ms: number;
};

function durationMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function emitTiming(context: ApiTimingContext, status: number, duration: number) {
  const event: TimingEvent = {
    event: "modulex_api_timing",
    route: context.route,
    method: context.method,
    status,
    duration_ms: duration,
  };

  console.info(event);
}

export async function withApiTiming(
  context: ApiTimingContext,
  handler: () => Promise<Response> | Response
): Promise<Response> {
  const startedAt = performance.now();

  try {
    const response = await handler();
    const duration = durationMs(startedAt);
    response.headers.set("Server-Timing", `modulex_api;dur=${duration}`);
    emitTiming(context, response.status, duration);
    return response;
  } catch (error) {
    emitTiming(context, 500, durationMs(startedAt));
    throw error;
  }
}
