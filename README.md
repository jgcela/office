# Oficina de agentes

Una oficina pixel-art donde cada mesa es un agente de Claude con su propio rol. Le das una tarea, pasa en orden por los agentes activos (cada uno recibe lo que entregó el anterior) y el resultado se guarda como borrador en Markdown.

Viene configurada con el equipo de **Parent Portal 2.0** (9 perfiles), pero el contexto y los roles se cambian desde la interfaz para cualquier otro proyecto.

## Requisitos

- Node.js 18 o superior (no hace falta `npm install`: no tiene dependencias)
- Una API key de Anthropic: <https://console.anthropic.com>

## Arranque

```bash
cp .env.example .env      # y pega tu ANTHROPIC_API_KEY
npm start
```

Abre <http://127.0.0.1:8020>. Arriba a la derecha debe decir **Conectado a Claude**.

## Cómo se usa

- **Haz clic en una mesa** para editar la especialidad de ese agente o sacarlo de la cadena ("Activo en la cadena").
- **Contexto común**: lo leen todos los agentes antes de su rol. Cámbialo para que el equipo trabaje en otro proyecto.
- **Añade una tarea**: verás en vivo lo que escribe cada agente.
- **Borradores**: cada tarea terminada se guarda en `drafts/` con la aportación de cada agente.
- **Cuota**: contador diario de llamadas (100 por defecto) para no gastar de más. Cada agente activo es una llamada por tarea.

## Dónde se guarda cada cosa

| Qué | Dónde |
| --- | --- |
| Roles por defecto y personajes | `public/agents.js` |
| Tus roles y contexto editados | `data/config.json` (no se sube a Git) |
| Borradores | `drafts/*.md` (no se suben a Git) |
| API key | `.env` (no se sube a Git) |

## Configuración opcional (`.env`)

| Variable | Por defecto |
| --- | --- |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
| `MAX_TOKENS` | `4000` |
| `PORT` | `8020` |
| `HOST` | `127.0.0.1` (solo tu ordenador) |

## Estructura

```
server.js          servidor HTTP: interfaz, configuración, borradores y llamadas a Anthropic (streaming)
public/index.html  la oficina
public/styles.css  estilo pixel-art
public/app.js      lógica de la cola y los agentes
public/agents.js   equipo por defecto, contexto y sprites
```

La API key nunca llega al navegador: solo el servidor habla con Anthropic.
