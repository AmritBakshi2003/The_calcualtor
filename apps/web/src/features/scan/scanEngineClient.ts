/**
 * Same-origin client for the server side of the scan pipeline (Phase 3/4):
 * OCR.space (soft-fail engine) and the consensus route (cache + decide +
 * protected Gemini arbiter).
 *
 * Both calls send the enhanced crop as a PNG data URI (the server's image
 * parser accepts bare base64 or data URIs). Failures are soft: this client
 * never throws for engine-level problems — it returns typed results the UI
 * can map onto plain-language stage messages. Only true transport failures
 * reject, and the caller decides the fallback.
 */

export interface OcrSpaceClientResult {
  available: boolean;
  expression?: string;
  rawText?: string;
  engine?: 1 | 2;
  reason?: string;
}

export interface ConsensusClientResult {
  expression: string;
  verified: boolean;
  sources: string[];
  alternatives: string[];
  stages: string[];
}

export interface ConsensusCandidateInput {
  expression: string;
  confidence?: number;
  source: string;
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Ask the server's OCR.space engine to read the enhanced crop. */
export async function requestOcrSpace(image: string): Promise<OcrSpaceClientResult> {
  try {
    const response = await postJson('/api/scan/ocrspace', { image, mime: 'image/png' });
    if (!response.ok) return { available: false, reason: `http_${response.status}` };
    return (await response.json()) as OcrSpaceClientResult;
  } catch {
    return { available: false, reason: 'unreachable' };
  }
}

/** Run the consensus pipeline (cache -> decide -> protected Gemini arbiter). */
export async function requestConsensus(
  image: string,
  candidates: ConsensusCandidateInput[]
): Promise<ConsensusClientResult> {
  const response = await postJson('/api/scan/consensus', {
    image,
    mime: 'image/png',
    candidates,
  });
  if (!response.ok) {
    throw new Error(`consensus_http_${response.status}`);
  }
  return (await response.json()) as ConsensusClientResult;
}

/** Plain-language message for an OCR.space soft failure (no internals leaked). */
export function ocrSpaceMessage(reason: string | undefined): string {
  switch (reason) {
    case 'timeout':
      return 'OCR.space timed out.';
    case 'not_configured':
      return 'OCR.space is not configured on this server.';
    case 'ocrspace_unavailable':
      return 'OCR.space is unavailable right now.';
    case 'ocrspace_malformed_response':
      return 'OCR.space sent an unreadable response.';
    case 'unreachable':
      return 'OCR.space is unreachable.';
    default:
      return 'OCR.space is unavailable right now.';
  }
}
