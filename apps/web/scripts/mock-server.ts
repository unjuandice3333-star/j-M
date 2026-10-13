export let capturedHandler: ((req: Request) => Promise<Response>) | null = null;

export function serve(handler: (req: Request) => Promise<Response>) {
  capturedHandler = handler;
}
