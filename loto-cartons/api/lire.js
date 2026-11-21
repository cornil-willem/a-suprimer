// Lecture d'une photo de cartons par Claude, pour l'appli installée sur le téléphone.
// L'appel passe par Vercel AI Gateway avec le jeton OIDC du déploiement : aucune clé API à fournir.
// La consigne est fixée ici (pas envoyée par le téléphone) : ce point d'accès ne sert qu'à lire des cartons.
import Anthropic from '@anthropic-ai/sdk';
import { PROMPT, CARD_SCHEMA } from './_consigne.js';

const MODEL = 'anthropic/claude-opus-5.5';
const MAX_BYTES = 4_000_000;
const ALLOWED_ORIGINS = new Set([
  'https://loto-cartons.vercel.app',
  'https://loto-cartons-art-et-paysage.vercel.app',
]);

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function GET() {
  return json({ ok: true, lecture: 'photos de cartons de loto' });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origine refusée.' }, 403);

  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json({ error: 'Envoie une photo JPEG ou PNG.' }, 415);
  const image = Buffer.from(await request.arrayBuffer());
  if (!image.length) return json({ error: 'Photo vide.' }, 400);
  if (image.length > MAX_BYTES) return json({ error: 'Photo trop lourde. Reprends-la de plus près.' }, 413);

  // Jeton OIDC du déploiement : en-tête sur Vercel, variable d'environnement en local.
  const token = request.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return json({ error: 'Lecture des photos indisponible sur ce serveur.', pause: true }, 503);

  const client = new Anthropic({ apiKey: token, baseURL: 'https://ai-gateway.vercel.sh', maxRetries: 2 });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: CARD_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: type, data: image.toString('base64') } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Trop de photos d\'un coup. Attends une minute puis touche « Tout réessayer ».', pause: true }, 429);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error('AI Gateway refuse l\'accès', err.status, err.message);
      return json({ error: 'Lecture refusée par le service (crédits Vercel AI Gateway épuisés ou non activés).', pause: true }, 503);
    }
    if (err instanceof Anthropic.BadRequestError) return json({ error: 'Photo refusée par le service : ' + err.message }, 422);
    if (err instanceof Anthropic.APIConnectionError) return json({ error: 'Service de lecture injoignable. Touche « Relire ».' }, 502);
    if (err instanceof Anthropic.APIError) {
      console.error('AI Gateway', err.status, err.message);
      if (err.status === 402) return json({ error: 'Crédits de lecture épuisés sur le compte Vercel (AI Gateway).', pause: true }, 503);
      return json({ error: `Service indisponible (${err.status || 'erreur'}). Touche « Relire ».` }, 502);
    }
    console.error(err);
    return json({ error: 'Erreur pendant la lecture. Touche « Relire ».' }, 500);
  }

  if (response.stop_reason === 'refusal') return json({ error: 'Claude n\'a pas pu lire cette photo.' }, 422);
  if (response.stop_reason === 'max_tokens') return json({ error: 'Trop de cartons sur une photo. Prends-en moins à la fois.' }, 422);
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    return json(JSON.parse(text));
  } catch (e) {
    return json({ error: 'Réponse illisible. Touche « Relire ».' }, 502);
  }
}
