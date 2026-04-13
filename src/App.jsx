import { useMemo, useState } from 'react';
import JSZip from 'jszip';

const CLAUDE_MODEL = 'claude-3-5-sonnet-latest';

function sanitizeXml(value = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function slugifyTitle(title) {
  return (title || 'book')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'book';
}

function getPrompt(rawText, title, author) {
  return `You are a professional book formatter.
Take the manuscript and split it into coherent chapters.
Return strict JSON with this schema:
{
  "chapters": [
    { "title": "Chapter title", "content": "Full chapter content" }
  ]
}
Rules:
- Ensure chapters are in reading order.
- Preserve tone and original wording where possible.
- If manuscript already has chapter headings, keep/improve them.
- Create at least 3 chapters when possible.
- Never include markdown fences.
Book title: ${title || 'Untitled'}
Author: ${author || 'Unknown'}
Manuscript:
${rawText}`;
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-amber" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16.5H6.5A2.5 2.5 0 0 0 4 22V5.5Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
      <path d="M8 7h7M8 10h9" />
    </svg>
  );
}

export default function App() {
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [chapters, setChapters] = useState(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeChapterData = useMemo(() => {
    if (!chapters?.length) return null;
    return chapters[activeChapter] ?? chapters[0];
  }, [chapters, activeChapter]);

  async function formatIntoChapters() {
    if (!rawText.trim()) {
      setError('Please paste your manuscript before formatting.');
      return;
    }

    if (!apiKey.trim()) {
      setError('Add an Anthropic API key to continue.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: getPrompt(rawText, title, author),
            },
          ],
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Claude API error: ${message}`);
      }

      const data = await response.json();
      const textPayload = data?.content?.find((item) => item.type === 'text')?.text;
      if (!textPayload) {
        throw new Error('Claude returned an unexpected response payload.');
      }

      const parsed = JSON.parse(textPayload);
      if (!Array.isArray(parsed?.chapters) || parsed.chapters.length === 0) {
        throw new Error('No chapters found in model response.');
      }

      const normalized = parsed.chapters
        .map((chapter, index) => ({
          title: chapter?.title?.trim() || `Chapter ${index + 1}`,
          content: chapter?.content?.trim() || '',
        }))
        .filter((chapter) => chapter.content);

      if (!normalized.length) {
        throw new Error('The generated chapters were empty.');
      }

      setChapters(normalized);
      setActiveChapter(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to format manuscript.');
    } finally {
      setLoading(false);
    }
  }

  async function exportEpub() {
    if (!chapters?.length) return;

    const zip = new JSZip();
    const uuid = crypto.randomUUID();
    const safeTitle = title.trim() || 'Untitled';
    const safeAuthor = author.trim() || 'Unknown';

    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );

    const manifestItems = chapters
      .map(
        (_, index) =>
          `<item id="chap${index + 1}" href="chapter${index + 1}.xhtml" media-type="application/xhtml+xml"/>`,
      )
      .join('\n    ');

    const spineItems = chapters.map((_, index) => `<itemref idref="chap${index + 1}"/>`).join('\n    ');

    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${sanitizeXml(safeTitle)}</dc:title>
    <dc:creator>${sanitizeXml(safeAuthor)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:${uuid}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`,
    );

    const navPoints = chapters
      .map(
        (chapter, index) =>
          `<navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${sanitizeXml(chapter.title)}</text></navLabel>
      <content src="chapter${index + 1}.xhtml"/>
    </navPoint>`,
      )
      .join('\n    ');

    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${sanitizeXml(safeTitle)}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`,
    );

    zip.file('OEBPS/style.css', 'body { font-family: Georgia, serif; line-height: 1.8; margin: 2em; }');

    chapters.forEach((chapter, index) => {
      const chapterBody = sanitizeXml(chapter.content).replaceAll('\n', '</p><p>');
      zip.file(
        `OEBPS/chapter${index + 1}.xhtml`,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${sanitizeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <h1>${sanitizeXml(chapter.title)}</h1>
    <p>${chapterBody}</p>
  </body>
</html>`,
      );
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${slugifyTitle(safeTitle)}.epub`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return (
    <div className="min-h-screen bg-charcoal text-cream">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex w-full flex-col border-b border-white/10 p-6 md:w-[35%] md:border-b-0 md:border-r">
          <div className="mb-6 flex items-center gap-2">
            <BookIcon />
            <h1 className="text-xl font-semibold tracking-wide">Kindle Scribble</h1>
          </div>

          <div className="space-y-4 font-ui">
            <label className="block text-sm">
              <span className="mb-1 block text-cream/80">Book Title</span>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-amber"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="The Last Lantern"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-cream/80">Author Name</span>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-amber"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="A. Writer"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-cream/80">Anthropic API Key</span>
              <input
                type="password"
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-amber"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-ant-api..."
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-cream/80">Paste your manuscript here...</span>
              <textarea
                className="h-64 min-h-40 w-full resize-y rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-amber md:h-[40vh]"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Once upon a winter morning..."
              />
            </label>

            <button
              onClick={formatIntoChapters}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-4 py-2 font-medium text-charcoal transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-charcoal/30 border-t-charcoal" />
                  Formatting...
                </>
              ) : (
                'Format into Chapters'
              )}
            </button>

            <p className={`min-h-5 text-sm text-red-400 transition ${error ? 'opacity-100' : 'opacity-0'}`}>
              {error || 'placeholder'}
            </p>
          </div>

          <div className="mt-auto pt-6">
            <button
              onClick={exportEpub}
              disabled={!chapters?.length}
              className="w-full rounded-lg border border-amber px-4 py-2 font-medium text-amber transition hover:bg-amber hover:text-charcoal disabled:cursor-not-allowed disabled:border-white/20 disabled:text-white/35 disabled:hover:bg-transparent"
            >
              Export ePub
            </button>
          </div>
        </aside>

        <main className="w-full p-4 md:w-[65%] md:p-6">
          {!chapters?.length ? (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
              <div className="mb-6 text-6xl">📖</div>
              <p className="max-w-sm text-lg text-cream/80">Your formatted book will appear here.</p>
            </div>
          ) : (
            <div className="flex h-full min-h-[70vh] flex-col gap-4 md:flex-row">
              <section className="max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] md:w-[30%]">
                {chapters.map((chapter, index) => {
                  const isActive = index === activeChapter;
                  return (
                    <button
                      key={`${chapter.title}-${index}`}
                      onClick={() => setActiveChapter(index)}
                      className={`w-full border-l-4 px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-amber bg-amber/10 text-cream'
                          : 'border-transparent text-cream/60 hover:bg-white/5 hover:text-cream'
                      }`}
                    >
                      <div className="text-xs uppercase tracking-wider text-cream/50">Chapter {index + 1}</div>
                      <div className="truncate text-sm">{chapter.title}</div>
                    </button>
                  );
                })}
              </section>

              <section
                key={activeChapterData?.title}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6 opacity-100 transition-opacity duration-300 md:w-[70%]"
              >
                <h2 className="mb-5 font-reading text-4xl text-cream">{activeChapterData?.title}</h2>
                <div className="font-reading text-lg leading-relaxed text-cream/90 whitespace-pre-wrap">
                  {activeChapterData?.content}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
