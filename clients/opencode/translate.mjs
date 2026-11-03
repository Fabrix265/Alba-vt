// Only the event kind and tool name cross the bridge: never args, output or errors.
export function translate(hook, input = {}, output = {}) {
  const canonical = (type, tool = null, ok = null) => ({ source: 'opencode', type, tool, ok, text: null, meta: {} });
  const tool = typeof input.tool === 'string' ? input.tool : null;
  if (hook === 'tool.execute.before') return canonical('tool.start', tool);
  if (hook === 'tool.execute.after') {
    const failed = output.metadata?.exit !== undefined && output.metadata.exit !== 0;
    return canonical(failed ? 'error' : 'tool.end', tool, !failed);
  }
  if (hook !== 'event') return null;
  const event = input.event;
  if (event?.type === 'session.idle') return canonical('session.idle');
  if (event?.type === 'session.created') return canonical('session.start');
  if (event?.type === 'session.error') return canonical('error', null, false);
  const part = event?.properties?.part;
  if (event?.type === 'message.part.updated' && part?.type === 'tool' && part.state?.status === 'error') {
    return canonical('error', typeof part.tool === 'string' ? part.tool : null, false);
  }
  return null;
}
