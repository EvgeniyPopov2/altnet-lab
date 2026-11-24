import { useState, type ReactNode } from "react";
import { loopSettings } from "../../dynamicContent";
import type { LoopGridBlock, Block, Device } from "../../types";

export default function LoopGridView({
  block,
  device = "desktop",
  render,
}: {
  block: LoopGridBlock;
  device?: Device;
  render?: (b: Block) => ReactNode;
}) {
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(0),
    { columns, pageSize, gap, filter, emptyText } = loopSettings(block);
  if (block.loopError) return <p role="alert">{block.loopError}</p>;
  const cards = block.cards ?? [],
    terms = [...new Set(cards.flatMap((c) => c.terms))].filter(Boolean);
  const found = cards.filter((c) => !term || c.terms.includes(term)),
    pages = Math.ceil(found.length / pageSize),
    index = Math.max(0, Math.min(page, pages - 1));
  return (
    <section className="sb-editor-loop">
      {filter && terms.length > 0 && (
        <label>
          Рубрика{" "}
          <select
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Все рубрики</option>
            {terms.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      )}
      {!found.length && <p>{emptyText}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(" + columns[device] + ",minmax(0,1fr))", gap }}>
        {found.slice(index * pageSize, (index + 1) * pageSize).map((c) => (
          <article key={c.entryId}>
            {c.blocks && render ? (
              c.blocks.map((b) => (
                <div key={b.id} inert>
                  {render(b)}
                </div>
              ))
            ) : (
              <>
                <h3>{c.title}</h3>
                <p>{c.description}</p>
                {c.more && <a href={c.href + "#" + c.more.fragment}>{c.more.label}</a>}
              </>
            )}
          </article>
        ))}
      </div>
      {pages > 1 && (
        <nav aria-label="Страницы цикла">
          <button type="button" disabled={!index} onClick={() => setPage(index - 1)}>
            Назад
          </button>{" "}
          {index + 1} / {pages}{" "}
          <button type="button" disabled={index + 1 >= pages} onClick={() => setPage(index + 1)}>
            Вперёд
          </button>
        </nav>
      )}
    </section>
  );
}
