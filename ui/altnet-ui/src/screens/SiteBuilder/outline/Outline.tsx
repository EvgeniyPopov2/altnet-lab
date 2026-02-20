// src/screens/SiteBuilder/outline/Outline.tsx
import { useState } from "react";
import type { Block } from "../types";

type Props = {
  blocks: Block[];
  selId?: string | null; // допускаем null, чтобы совпасть с состоянием экрана
  onSelect: (id: string) => void;
};

function labelOf(b: Block): string {
  switch (b.type) {
    case "hero":
      return "Hero";
    case "h1":
      return "Заголовок H1";
    case "heading":
      return b.level === "h3" ? "Заголовок H3" : b.level === "h4" ? "Заголовок H4" : "Заголовок H2";
    case "p":
      return "Текст";
    case "img":
      return "Изображение";
    case "btn":
      return "Кнопка";
    case "cols2":
      return "Колонки 2";
    case "spacer":
      return "Отступ";
    case "divider":
      return "Разделитель";
    case "section":
      return "Секция";
    case "grid":
      return "Сетка";
    default:
      // В теории недостижимый кейс (исчерпывающий switch), но без обращения к b.type,
      // иначе TS сузит b до never и выдаст ошибку.
      return "Блок";
  }
}

function previewText(b: Block): string {
  switch (b.type) {
    case "hero":
      return b.title || "Без заголовка";
    case "h1":
    case "heading":
    case "p":
      // у этих типов есть text
      return (b.text as string) || "";
    case "btn":
      return b.label || "";
    case "img":
      return b.alt || b.cid || "";
    case "cols2":
      return b.title || "";
    default:
      return "";
  }
}

// Узел дерева структуры: реальный блок или виртуальный "Контейнер"
type OutlineNode =
  | {
      kind: "block";
      key: string;
      block: Block;
      children: OutlineNode[];
    }
  | {
      kind: "virtual-container";
      key: string;
      label: string;
      parentId: string;
      children: OutlineNode[];
    };

/**
 * Строим простое дерево:
 * - каждый grid/section — корень;
 * - все блоки после него до следующего grid/section считаются его "виджетами";
 * - между grid и виджетами вставляем виртуальный узел "Контейнер".
 */
function buildOutlineTree(blocks: Block[]): OutlineNode[] {
  const result: OutlineNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const b = blocks[i];

    if (b.type === "grid" || b.type === "section") {
      const widgetNodes: OutlineNode[] = [];
      let j = i + 1;

      while (j < blocks.length) {
        const next = blocks[j];
        if (next.type === "grid" || next.type === "section") break;

        widgetNodes.push({
          kind: "block",
          key: next.id,
          block: next,
          children: [],
        });

        j++;
      }

      const containerNode: OutlineNode = {
        kind: "virtual-container",
        key: `${b.id}::container`,
        label: "Контейнер",
        parentId: b.id,
        children: widgetNodes,
      };

      result.push({
        kind: "block",
        key: b.id,
        block: b,
        children: widgetNodes.length > 0 ? [containerNode] : [],
      });

      i = j;
    } else {
      // обычный блок верхнего уровня
      result.push({
        kind: "block",
        key: b.id,
        block: b,
        children: [],
      });
      i++;
    }
  }

  return result;
}

/** Навигатор блоков в стиле "Структуры" Elementor: дерево с ветками и лёгким hover. */
export default function Outline({ blocks, selId, onSelect }: Props) {
  // collapsedKeys: какие узлы СВЁРНУТЫ (по умолчанию всё раскрыто)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());

  const tree = buildOutlineTree(blocks);

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderNode = (node: OutlineNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = !hasChildren || !collapsedKeys.has(node.key);

    const blockId = node.kind === "block" ? node.block.id : node.parentId;
    const isActive = selId === blockId;

    const baseIndent = 8 + depth * 12;

    const handleClick = () => {
      if (node.kind === "block") {
        onSelect(node.block.id);
      } else {
        // виртуальный контейнер — просто разворачиваем/сворачиваем
        toggleCollapsed(node.key);
      }
    };

    const isBlockNode = node.kind === "block";
    const block = isBlockNode ? node.block : undefined;

    // Превью показываем только для "листовых" реальных блоков (без детей)
    const showPreview = isBlockNode && !hasChildren;
    const preview = block ? previewText(block) : "";
    const isEmptyPreview = showPreview && !preview;

    return (
      <li key={node.key}>
        <div
          className={
            "flex items-center gap-1.5 pr-3 py-1.5 cursor-pointer select-none rounded-sm transition-colors " +
            (isActive ? "bg-[#141a33] ring-1 ring-[#5865f2]" : "hover:bg-[#101827]")
          }
          style={{ paddingLeft: baseIndent }}
          onClick={handleClick}
        >
          {hasChildren ? (
            <button
              type="button"
              className="mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] text-[#9aa3b2] hover:bg-[#111827]"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsed(node.key);
              }}
              aria-label={isExpanded ? "Свернуть" : "Развернуть"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )}

          {/* Буллет как в Elementor */}
          <span className="text-[12px] leading-none text-[#cfd5e6]">•</span>

          <span className="text-[13px] text-[#e6e9f4]">
            {node.kind === "block" ? labelOf(node.block) : node.label}
          </span>
        </div>

        {showPreview && (
          <div
            className="pr-3 pb-1 text-xs text-[#9aa3b2]"
            style={{ paddingLeft: baseIndent + 16 }}
          >
            {isEmptyPreview ? (
              "Пустой"
            ) : (
              <span className="line-clamp-1" title={preview}>
                {preview}
              </span>
            )}
          </div>
        )}

        {hasChildren && isExpanded && (
          <ul>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    // Внешняя рамка/заголовок рисуются контейнером панели
    <div className="text-sm">
      <ul className="divide-y divide-[#1f2751]">
        {tree.map((node) => renderNode(node, 0))}
      </ul>
    </div>
  );
}
