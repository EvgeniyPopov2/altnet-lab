import { Fragment, type ReactNode } from "react";
import { paragraphRuns } from "../../inlineText";

export default function InlineRuns({ text, runs }: { text: string; runs: unknown }) {
  return paragraphRuns(text, runs).map((run, i) => {
    let value: ReactNode = run.text;
    if (run.bold) value = <strong>{value}</strong>;
    if (run.italic) value = <em>{value}</em>;
    if (run.underline) value = <u>{value}</u>;
    if (run.strike) value = <s>{value}</s>;
    if (run.code) value = <code>{value}</code>;
    if (run.href) value = <a href={run.href}>{value}</a>;
    return <Fragment key={i}>{value}</Fragment>;
  });
}
