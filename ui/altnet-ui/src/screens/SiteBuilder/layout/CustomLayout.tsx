import { useState } from "react";
import { MAX_GRID_COLUMNS, MAX_GRID_CELLS } from "../gridLayout";

export default function CustomLayout({
  grid,
  onInsert,
}: {
  grid: boolean;
  onInsert: (weights: number[], rows: number) => void;
}) {
  const [weights, setWeights] = useState([1, 1]);
  const [rows, setRows] = useState(1);
  const maxRows = Math.floor(MAX_GRID_CELLS / weights.length);
  const height = grid ? Math.min(rows, maxRows) : 1;
  return (
    <details className="sb-custom-layout">
      <summary>Своя структура</summary>
      <div className="sb-custom-settings">
        <label>
          Колонки
          <select
            value={weights.length}
            onChange={(e) => {
              const count = Number(e.target.value);
              setWeights((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? 1));
              setRows((n) => Math.min(n, Math.floor(MAX_GRID_CELLS / count)));
            }}
          >
            {Array.from({ length: MAX_GRID_COLUMNS }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        {grid && (
          <label>
            Строки
            <select value={height} onChange={(e) => setRows(Number(e.target.value))}>
              {Array.from({ length: maxRows }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <fieldset>
        <legend>Пропорции колонок</legend>
        <div className="sb-custom-weights">
          {weights.map((value, index) => (
            <label key={index}>
              {index + 1}
              <input
                type="number"
                min={1}
                max={16}
                value={value}
                aria-label={"Вес колонки " + (index + 1)}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isInteger(n))
                    setWeights((old) => old.map((v, i) => (i === index ? Math.max(1, Math.min(16, n)) : v)));
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div
        className="sb-column-preview"
        data-custom-layout-preview
        aria-label={weights.length + " × " + height}
        style={{
          maxWidth: "none",
          height: Math.max(42, height * 5 + 4),
          gridTemplateColumns: weights.map((n) => "minmax(0," + n + "fr)").join(" "),
          gridTemplateRows: "repeat(" + height + ",minmax(0,1fr))",
        }}
      >
        {Array.from({ length: weights.length * height }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <button type="button" onClick={() => onInsert(weights, height)}>
        Вставить свой макет
      </button>
    </details>
  );
}
