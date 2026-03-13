
export interface ParsedTakeoffItem {
  description: string;
  qty: number;
  uom: string;
  roomName?: string;
  scopeName?: string;
  notes?: string;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asNumber(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const gemini = {
  async parseTakeoffDocument(fileBase64: string, mimeType: string, fileName = 'takeoff-upload'): Promise<ParsedTakeoffItem[]> {
    const sourceType = mimeType.toLowerCase().startsWith('image/') ? 'image' : 'pdf';
    const res = await fetch('/api/v1/intake/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        mimeType: mimeType || (sourceType === 'image' ? 'image/png' : 'application/pdf'),
        sourceType,
        dataBase64: fileBase64,
      }),
    });

    if (!res.ok) {
      let message = `Request failed with status ${res.status}`;
      try {
        const payload = await res.json();
        message = payload.error || payload.message || message;
      } catch (_error) {
        // ignore json parse failures
      }
      throw new Error(message);
    }

    const payload = await res.json() as {
      data?: {
        parsedLines?: Array<{
          roomArea?: string;
          category?: string;
          itemName?: string;
          description?: string;
          quantity?: number;
          unit?: string;
          notes?: string;
        }>;
      };
    };

    return Array.isArray(payload.data?.parsedLines)
      ? payload.data!.parsedLines!
          .map((line) => ({
            description: asText(line.itemName) || asText(line.description),
            qty: asNumber(line.quantity, 1),
            uom: asText(line.unit) || 'EA',
            roomName: asText(line.roomArea) || undefined,
            scopeName: asText(line.category) || undefined,
            notes: asText(line.notes) || undefined,
          }))
          .filter((line) => line.description)
      : [];
  }
};
