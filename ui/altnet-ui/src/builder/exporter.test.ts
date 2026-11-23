import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { adaptFromSiteBuilderDoc, exportSingleHtml, exportSiteZip, unsupportedBlockTypes } from "./exporter";

it("экспортирует адаптивное оформление изображения и блока в HTML и ZIP", async () => {
  const source = { title: "Тест", blocks: [{ type: "img", cid: "", alt: "Пример", styleByBp: { desktop: { w: 80, minh: 140, op: 60 } }, imageStyleByBp: { desktop: { width: 70, opacity: 80, fit: "cover" }, mobile: { width: 40, height: 200 } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain('class="responsive sb-image-0"');
  expect(html).toContain(".sb-image-0{width:70%;opacity:0.8;object-fit:cover}");
  expect(html).toContain("@media(max-width:767px){.sb-image-0{width:40%;height:200px;opacity:0.8;object-fit:cover}}");
  expect(html).toContain("width:80%;min-height:140px;opacity:0.6");
  const zip = await JSZip.loadAsync(await (await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).arrayBuffer());
  expect(await zip.file("styles.css")!.async("string")).toContain(".sb-image-0{width:70%;opacity:0.8;object-fit:cover}");
  expect(await zip.file("index.html")!.async("string")).toContain('class="responsive sb-image-0"');
});
import { SITE_RUNTIME, SITE_RUNTIME_HASH } from "./siteRuntime";
import { fetchAndCleanImage } from "./cdr";

it.each(["html", "zip"] as const)("сохраняет ссылку, подпись и состояния изображения в %s", async format => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "img", cid: "", alt: "Описание & детали", caption: "Кадр <один>", href: "./contacts.html", linkOpen: "new", linkIndexing: "nofollow", imageStyleByBp: { desktop: { radius: 12, brightness: 120, hoverOpacity: 55, hoverBlur: 3, duration: 200 }, mobile: { hoverOpacity: 70 } } }] });
  const blob = format === "html" ? await exportSingleHtml(model, { bundleAssets: false }) : await exportSiteZip(model, { bundleAssets: false });
  const zip = format === "zip" ? await JSZip.loadAsync(await blob.arrayBuffer()) : undefined;
  const html = zip ? await zip.file("index.html")!.async("string") : await blob.text();
  const css = zip ? await zip.file("styles.css")!.async("string") : html;
  expect(html).toContain('<figure class="sb-image-figure"><a class="sb-image-link" href="./contacts.html" target="_blank" rel="noopener noreferrer nofollow">');
  expect(html).toContain('alt="Описание &amp; детали"');
  expect(html).toContain('<figcaption>Кадр &lt;один&gt;</figcaption>');
  expect(css).toContain("border-radius:12px!important");
  expect(css).toContain(".sb-image-0:hover,.sb-image-link:focus-visible>.sb-image-0{opacity:0.55;filter:brightness(120%) contrast(100%) saturate(100%) blur(3px)}");
  expect(css).toContain("opacity:0.7");
  expect(css).toContain("@media(prefers-reduced-motion:reduce)");
});

it("очищает опасные ссылки и подписи изображения", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "img", caption: '<img src=x onerror=alert(1)>', href: "javascript:evil()", imageStyleByBp: { desktop: { borderColor: "red;position:fixed", hoverOpacity: "1;position:fixed" } } }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).not.toContain("javascript:evil()");
  expect(html).not.toContain("red;position:fixed");
  expect(html).not.toContain("1;position:fixed");
});

it.each(["html", "zip"] as const)("сохраняет адаптивное выравнивание изображения и стиль подписи в %s", async format => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "img", caption: "Подпись", imageStyleByBp: { desktop: { align: "center", borderType: "double", borderWidth: 4, captionColor: "#123456", captionSize: 18, captionSpacing: 12, captionAlign: "right" }, mobile: { align: "left", captionSize: 13, captionSpacing: 4 } } }] });
  const blob = format === "html" ? await exportSingleHtml(model, { bundleAssets: false }) : await exportSiteZip(model, { bundleAssets: false });
  const zip = format === "zip" ? await JSZip.loadAsync(await blob.arrayBuffer()) : undefined;
  const html = zip ? await zip.file("index.html")!.async("string") : await blob.text();
  const css = zip ? await zip.file("styles.css")!.async("string") : html;
  expect(html).toContain('<div class="sb-image-wrap-0">');
  expect(html).toContain('<figcaption class="sb-image-caption-0">Подпись</figcaption>');
  expect(css).toContain('.sb-image-wrap-0{text-align:center}');
  expect(css).toContain('@media(max-width:767px){.sb-image-wrap-0{text-align:left}}');
  expect(css).toContain('border-width:4px;border-style:double;display:inline-block');
  expect(css).toContain('figcaption.sb-image-caption-0{font-size:18px;margin-top:12px;color:#123456;text-align:right}');
  expect(css).toContain('font-size:13px;margin-top:4px');
});

it("публикует выбранную сетку через CSS Grid с адаптивными колонками", async () => {
  const source = { title: "Сетка", blocks: [{ id: "grid", type: "grid", items: [], layoutPreset: [2, 1], layoutCells: [[], []], layoutByBp: { mobile: { mode: "stack", gap: 8 } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain("display:grid;align-items:stretch;grid-template-columns:minmax(0,2fr) minmax(0,1fr)");
  expect(html).toContain("gap:8px;grid-template-columns:minmax(0,1fr)");
});

it("экспортирует несколько строк сетки с сохранением содержимого ячеек", async () => {
  const source = { title: "Сетка", blocks: [{ id: "grid", type: "grid", items: [], layoutColumns: 2, layoutPreset: [2, 1, 2, 1], layoutCells: [[], [], [{ id: "x", type: "p", text: "Вторая строка" }], []], layoutByBp: { mobile: { mode: "columns", weights: [1, 3] } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain("grid-template-columns:minmax(0,2fr) minmax(0,1fr)");
  expect(html).toContain("grid-template-columns:minmax(0,1fr) minmax(0,3fr)");
  expect(html).toContain("Вторая строка");
  expect((html.match(/class="layout-cell /g) || [])).toHaveLength(4);
});

it("экспортирует отдельные расстояния строк и колонок на разных устройствах", async () => {
  const source = { blocks: [{ type: "grid", items: [], layoutColumns: 2, layoutCells: [[], [], [], []], layoutGap: 12, layoutGapX: 24, layoutGapY: 8, layoutByBp: { mobile: { gapX: 4, gapY: 20 } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain("column-gap:24px;row-gap:8px");
  expect(html).toContain("column-gap:4px;row-gap:20px");
});

it.each(["html", "zip"] as const)("экспортирует объединённые области и мобильный порядок в %s", async format => {
  const source = { title: "Сетка", blocks: [{ id: "grid", type: "grid", items: [], layoutColumns: 3, layoutPreset: [1, 1, 1, 1, 1, 1], layoutMerges: [{ start: 0, columns: 2, rows: 2 }], layoutCells: [[{ id: "a", type: "p", text: "Главная область" }], [], [{ id: "b", type: "p", text: "Сосед" }], [], [], []] }] };
  const blob = format === "html" ? await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false }) : await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false });
  const zip = format === "zip" ? await JSZip.loadAsync(await blob.arrayBuffer()) : null;
  const html = zip ? await zip.file("index.html")!.async("string") : await blob.text();
  const css = zip ? await zip.file("styles.css")!.async("string") : html;
  expect(html).toContain("Главная область");
  expect(html).toContain("Сосед");
  expect(css).toContain(".sb-layout-0>.layout-cell:nth-child(1){grid-column:1/span 2;grid-row:1/span 2}");
  expect(css).toContain(".sb-layout-0>.layout-cell:nth-child(2){display:none}");
  expect(css).toContain(".sb-layout-0>.layout-cell:nth-child(1){grid-column:auto;grid-row:auto}");
});

it("не скрывает занятое содержимое в повреждённом объединении", async () => {
  const source = { blocks: [{ type: "grid", items: [], layoutColumns: 2, layoutMerges: [{ start: 0, columns: 2, rows: 1 }], layoutCells: [[], [{ id: "p", type: "p", text: "Сохранить" }]] }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain("Сохранить");
  expect(html).not.toContain(".sb-layout-0>.layout-cell:nth-child(2){display:none}");
});

it("экспортирует безопасный выбор шрифта с наследованием и отклоняет произвольный CSS", async () => {
  const source = { blocks: [{ type: "p", text: "Текст", styleByBp: { desktop: { ff: "Georgia" }, mobile: { ff: "monospace" } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain("font-family:Georgia");
  expect(html).toContain("font-family:monospace");
  expect(html).toContain("font-family:inherit");
  const unsafe = { blocks: [{ type: "p", text: "Текст", styleByBp: { desktop: { ff: "x; background:url(https://example.invalid/track)" } } }] };
  const result = await (await exportSingleHtml(adaptFromSiteBuilderDoc(unsafe), { bundleAssets: false })).text();
  expect(result).not.toContain("example.invalid");
});

it.each(["html", "zip"] as const)("экспортирует состояния и адаптивный стиль кнопки в %s", async format => {
  const source = { title: "Тест", blocks: [{ id: "b", type: "btn", label: "Кнопка", href: "#details", styleByBp: { desktop: { tc: "#aaaaaa" } }, buttonStyleByBp: {
    desktop: { color: "#123456", bg: "#abcdef", borderWidth: 2, radius: 12, paddingX: 20, hoverBg: "#ff9900", hoverColor: "#000000", duration: 200 },
    mobile: { bg: "#0000ff", hoverRadius: 20 },
  } }] };
  const blob = format === "html" ? await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false }) : await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false });
  const zip = format === "zip" ? await JSZip.loadAsync(await blob.arrayBuffer()) : null;
  const html = zip ? await zip.file("index.html")!.async("string") : await blob.text();
  const css = zip ? await zip.file("styles.css")!.async("string") : html;
  expect(html).toContain('class="btn sb-button-0"');
  expect(css).toContain(".sb-button-0.btn{color:#123456!important;background-color:#abcdef;border-width:2px;border-radius:12px;padding-inline:20px;border-style:solid;");
  expect(css).toContain(".sb-button-0.btn:hover,.sb-button-0.btn:focus-visible{color:#000000!important;background-color:#ff9900}");
  expect(css).toContain("background-color:#0000ff");
  expect(css).toContain("border-radius:20px");
  expect(css).toContain("@media(prefers-reduced-motion:reduce){.sb-button-0.btn{transition-duration:0ms!important}}");
});

it("не вставляет произвольный CSS из настроек кнопки", async () => {
  const source = { blocks: [{ type: "btn", buttonStyleByBp: { desktop: { bg: "</style><script>evil()</script>", hoverColor: "red; background:url(https://example.invalid)" } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).not.toContain("example.invalid");
  expect(html).not.toContain("evil()");
});

it("сохраняет индивидуальный стиль кнопки внутри вложенной секции", async () => {
  const source = { blocks: [{ type: "section", layoutPreset: [1], layoutCells: [[{ type: "btn", label: "Вложенная", buttonStyleByBp: { desktop: { bg: "#123456", hoverBg: "#abcdef" } } }]] }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain('class="btn sb-button-1"');
  expect(html).toContain(".sb-button-1.btn{background-color:#123456}");
  expect(html).toContain(".sb-button-1.btn:hover,.sb-button-1.btn:focus-visible{background-color:#abcdef}");
});

it.each(["html", "zip"] as const)("сохраняет иконку и независимые отступы кнопки в %s", async format => {
  const source = { blocks: [{ type: "btn", label: "Скачать", icon: "download", iconPosition: "after", buttonStyleByBp: {
    desktop: { paddingX: 20, paddingY: 10, paddingTop: 3, iconSize: 24, iconGap: 11 },
    mobile: { paddingY: 6, iconSize: 14 },
  } }] };
  const blob = format === "html" ? await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false }) : await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false });
  const zip = format === "zip" ? await JSZip.loadAsync(await blob.arrayBuffer()) : null;
  const html = zip ? await zip.file("index.html")!.async("string") : await blob.text();
  const css = zip ? await zip.file("styles.css")!.async("string") : html;
  expect(html).toContain('Скачать<svg class="sb-button-icon"');
  expect(html).toContain('aria-hidden="true" focusable="false"');
  expect(css).toContain("padding-top:3px;padding-right:20px;padding-bottom:10px;padding-left:20px");
  expect(css).toContain("padding-top:6px;padding-right:20px;padding-bottom:6px;padding-left:20px");
  expect(css).toContain(".sb-button-0.btn>.sb-button-icon{width:24px;height:24px}");
  expect(css).toContain(".sb-button-0.btn>.sb-button-icon{width:14px;height:14px}");
  expect(css).toContain("gap:11px");
});

it("не вставляет произвольный SVG через имя иконки кнопки", async () => {
  const source = { blocks: [{ type: "btn", label: "Тест", icon: '<svg onload="evil()">' }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).not.toContain("evil()");
  expect(html).not.toContain('class="sb-button-icon"');
});

it.each(["html", "zip"] as const)("сохраняет градиент и тень кнопки и её состояния в %s", async format => {
  const source = { blocks: [{ type: "btn", label: "Кнопка", buttonStyleByBp: { desktop: {
    backgroundType: "gradient", gradientStart: "#123456", gradientEnd: "#abcdef", gradientAngle: 90,
    shadowMode: "on", shadowX: -3, shadowY: 5, shadowBlur: 8, shadowSpread: 2, shadowColor: "#ff000080",
    hoverBackgroundType: "solid", hoverShadowMode: "off",
  } } }] };
  const blob = format === "html" ? await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false }) : await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false });
  const css = format === "html" ? await blob.text() : await (await JSZip.loadAsync(await blob.arrayBuffer())).file("styles.css")!.async("string");
  expect(css).toContain("background-image:linear-gradient(90deg,#123456,#abcdef)");
  expect(css).toContain("box-shadow:-3px 5px 8px 2px #ff000080");
  expect(css).toContain(".sb-button-0.btn:hover,.sb-button-0.btn:focus-visible{background-image:none;box-shadow:none}");
});

it("экспортирует отдельный безопасный стиль нажатия кнопки", async () => {
  const source = { blocks: [{ type: "btn", buttonStyleByBp: { desktop: { hoverBg: "#abcdef", activeBg: "#123456", activeColor: "#ffffff", activePaddingLeft: 17 } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain(".sb-button-0.btn:active{color:#ffffff!important;background-color:#123456;padding-left:17px}");
});

it.each(["html", "zip"] as const)("сохраняет настройки ссылки и доступное имя кнопки в %s", async format => {
  const source = { blocks: [
    { type: "btn", label: "Контакты", href: "./contacts.html", linkOpen: "new", linkIndexing: "nofollow", accessibleLabel: 'Открыть «Контакты» & "помощь"' },
    { type: "btn", label: "Внешняя", href: "https://example.org", linkOpen: "same", linkIndexing: "follow" },
    { type: "btn", label: "Внутренняя", href: "./home.html", linkOpen: "same", linkIndexing: "follow" },
    { type: "btn", label: "Безопасная", href: "javascript:evil()", linkOpen: "auto" },
  ] };
  const blob = format === "html" ? await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false }) : await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false });
  const html = format === "html" ? await blob.text() : await (await JSZip.loadAsync(await blob.arrayBuffer())).file("index.html")!.async("string");
  expect(html).toContain('href="./contacts.html" rel="noopener noreferrer nofollow" target="_blank" aria-label="Открыть «Контакты» &amp; &quot;помощь&quot;"');
  expect(html).toContain('href="https://example.org" rel="noopener noreferrer" target="_self"');
  expect(html).toContain('href="./home.html" rel="noopener noreferrer" target="_self"');
  expect(html).toContain('href="#" target="_self"');
  expect(html).not.toContain("javascript:evil()");
});

it.each(["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"])("экспортирует семантический тег заголовка %s", async level => {
  const source = { blocks: [{ type: "heading", level, text: "Раздел", href: "./contacts.html", linkOpen: "new", linkIndexing: "follow", styleByBp: { desktop: { fs: 32 } } }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain(`<${level}><a href="./contacts.html" target="_blank" rel="noopener noreferrer">Раздел</a></${level}>`);
  expect(html).toContain("font-size:32px");
});

it("отклоняет небезопасный тег и адрес заголовка при экспорте", async () => {
  const source = { blocks: [{ type: "heading", level: 'h2><script>evil()', text: "<Текст>", href: "javascript:evil()" }] };
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).text();
  expect(html).toContain("<h2><a href=\"#\"");
  expect(html).toContain("&lt;Текст&gt;");
  expect(html).not.toContain("evil()");
});

it("сохраняет ссылку и выбранный тег заголовка в многофайловом ZIP", async () => {
  const source = { blocks: [{ type: "heading", level: "h6", text: "Раздел", href: "https://example.org", linkOpen: "same", linkIndexing: "follow" }] };
  const zip = await JSZip.loadAsync(await (await exportSiteZip(adaptFromSiteBuilderDoc(source), { bundleAssets: false })).arrayBuffer());
  const html = await zip.file("index.html")!.async("string");
  expect(html).toContain('<h6><a href="https://example.org" target="_self" rel="noopener noreferrer">Раздел</a></h6>');
});

it.each(["html", "zip"] as const)("сохраняет описание и выбранное изображение соцсетей в %s", async format => {
  const model = adaptFromSiteBuilderDoc({ title: 'Страница <один>', description: 'Описание & детали', ogImage: 'https://example.org/cover.png?x=1&y=2', seo: { canonical: 'https://example.org/page?a=1&b=2', index: false, follow: false }, blocks: [] });
  const blob = format === "html" ? await exportSingleHtml(model, { bundleAssets: false }) : await exportSiteZip(model, { bundleAssets: false });
  const html = format === "html" ? await blob.text() : await (await JSZip.loadAsync(await blob.arrayBuffer())).file("index.html")!.async("string");
  expect(html).toContain('<title>Страница &lt;один&gt;</title>');
  expect(html).toContain('<meta name="description" content="Описание &amp; детали"/>');
  expect(html).toContain('<meta property="og:image" content="https://example.org/cover.png?x=1&amp;y=2"/>');
  expect(html).toContain('<meta name="twitter:image" content="https://example.org/cover.png?x=1&amp;y=2"/>');
  expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
  expect(html).toContain('<link rel="canonical" href="https://example.org/page?a=1&amp;b=2"/>');
});

it.each(["javascript:alert(1)", "https://user:secret@example.org/image", "https://example.org/\nimage", "https://example.org\\evil"])("не включает опасный адрес изображения соцсетей %s", async ogImage => {
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ title: "Тест", ogImage, blocks: [] }), { bundleAssets: false })).text();
  expect(html).not.toContain('property="og:image"');
  expect(html).not.toContain("secret");
});

it.each(["javascript:alert(1)", "https://user:secret@example.org/page", "https://example.org/page#fragment", "https://example.org/\npage"])("не включает недопустимый канонический адрес %s", async canonical => {
  const model = adaptFromSiteBuilderDoc({ title: "Тест", seo: { canonical }, blocks: [] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).not.toContain('rel="canonical"');
  expect(html).toContain('<meta name="robots" content="index, follow"/>');
  expect(html).not.toContain("secret");
});

it("создаёт sitemap для индексируемого одностраничного сайта с указанным адресом", async () => {
  const model = adaptFromSiteBuilderDoc({ title: "Тест", seo: { canonical: "https://example.org/?a=1&b=2" }, blocks: [] });
  const zip = await JSZip.loadAsync(await (await exportSiteZip(model, { bundleAssets: false })).arrayBuffer());
  expect(await zip.file("sitemap.xml")!.async("string")).toContain("https://example.org/?a=1&amp;b=2");
});

it("экспортирует тарифы, их возможности и безопасные ссылки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "pricetable", plans: [
    { name: "Команда <Pro>", price: "990 ₽", period: "/мес", popular: true, ctaLabel: "Выбрать", ctaHref: "javascript:alert(1)", features: [{ label: "Поддержка", included: true }, { label: "Резерв", included: false }] },
  ] }] });
  expect(unsupportedBlockTypes(model)).toEqual([]);
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("Команда &lt;Pro&gt;");
  expect(html).toContain("Популярный");
  expect(html).toContain('aria-label="Включено"');
  expect(html).toContain('aria-label="Не включено"');
  expect(html).toContain('href="#"');
  expect(html).not.toContain("javascript:alert");
});

it("сохраняет параметры разделителя в безопасных CSS-правилах", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "divider", width: 65, thickness: 3, lineStyle: "dashed", align: "center", color: "#123456" }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain(".sb-divider-0{width:65%;border-top:3px dashed #123456;margin:16px auto}");
  expect(html).toContain('class="divider sb-divider-0"');
});

it("сохраняет адаптивную высоту отступа и применяет пользовательские стили после базовых", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "spacer", size: "md", heightByBp: { desktop: 70, mobile: 12 } }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain(".sb-spacer-0{height:70px}");
  expect(html).toContain(".sb-spacer-0{height:12px}");
  expect(html.indexOf(".sb-spacer-0{height:70px}")).toBeGreaterThan(html.indexOf(".spacer-md{height:32px}"));
});

it("экспортирует видимость блока для конкретных экранов без скрытия на остальных", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "p", text: "Текст", hideOn: { mobile: true, tablet: false } }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('class="sb-visibility-0"');
  expect(html).toContain("@media(max-width:767px){.sb-visibility-0{display:none!important}}");
  expect(html).not.toContain("@media(min-width:768px) and (max-width:1024px){.sb-visibility-0");
});

it("экспортирует анимированный счётчик с безопасными пределами и конечным значением для скринридера", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "counter", value: 123.45, prefix: "≈", suffix: "+", animate: true, start: -5, decimals: 2, durationMs: 500 }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('data-counter data-start="-5" data-target="123.45" data-duration="500" data-decimals="2"');
  expect(html).toContain('aria-label="≈123.45+"');
  expect(html).toContain(SITE_RUNTIME);
});

it("не обрезает большое значение счётчика, если анимация выходит за допустимый диапазон", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "counter", value: 2000000000000, animate: true }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('class="counter">2000000000000</div>');
  expect(html).not.toContain('data-counter data-start=');
});

it("сохраняет медиакарусель, включая прежний формат, и не загружает внешние изображения без транспорта", async () => {
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn() }), toDataURL: () => "data:image/png;base64,UElD" }) });
  const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
  try {
    const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "mediacarousel", initial: 1, items: [
      { type: "img", src: "https://example.invalid/image.png", alt: "Кадр" },
      { type: "video", src: "https://example.invalid/video.mp4", caption: "Фильм" },
    ] }] });
    expect(unsupportedBlockTypes(model)).toEqual([]);
    const html = await (await exportSingleHtml(model)).text();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).not.toContain("https://example.invalid/image.png");
    expect(html).toContain('src="data:image/png;base64,UElD"');
    expect(html).toContain('src="https://example.invalid/video.mp4" controls preload="none"');
    expect(html).toContain("Фильм");
    expect(html).toContain(SITE_RUNTIME);
  } finally { vi.unstubAllGlobals(); }
});

it("экспортирует маркеры в проверенных CSS-координатах и очищает ссылки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "hotspot", src: "", markers: [
    { x: 25, y: 70, label: "Узнать подробнее", href: "#details" },
    { x: 999, y: -100, label: "Опасная ссылка", href: "javascript:alert(1)" },
  ] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('.sb-hotspot-0-0{left:25%;top:70%}');
  expect(html).toContain('.sb-hotspot-0-1{left:100%;top:0%}');
  expect(html).toContain('href="#details"');
  expect(html).not.toContain('javascript:alert');
  expect(unsupportedBlockTypes(model)).toEqual([]);
});

it("экспортирует видеоплейлист с выбранным видео и очищенными источниками", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "videoplaylist", initial: 1, items: [
    { title: "Первое", src: "javascript:alert(1)" }, { title: "Второе", src: "data:video/mp4;base64,AAAA" },
  ] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('data-playlist-select="1" aria-pressed="true"');
  expect(html).toContain('src="data:video/mp4;base64,AAAA"');
  expect(html).not.toContain("javascript:alert");
  expect(html).toContain(SITE_RUNTIME);
  expect(unsupportedBlockTypes(model)).toEqual([]);
});

it("сохраняет вложенные виджеты внутри выезжающей панели", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ id: "drawer", type: "offcanvas", title: "Меню", body: "Вступление", layoutPreset: [1], layoutCells: [[{ id: "paragraph", type: "p", text: "Вложенное содержимое" }]] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("Вступление");
  expect(html).toContain("Вложенное содержимое");
  expect(html.indexOf("Вложенное содержимое")).toBeGreaterThan(html.indexOf("<dialog"));
  expect(html.indexOf("Вложенное содержимое")).toBeLessThan(html.indexOf("</dialog>"));
  expect(unsupportedBlockTypes(model)).toEqual([]);
});

describe("экспорт при ошибке очистки изображения", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["html", "zip"] as const)("заменяет изображение заглушкой в %s", async (format) => {
    const original = "ORIGINAL_PRIVATE_IMAGE";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new Blob([original], { type: "image/png" }),
    )));
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));
    vi.stubGlobal("document", { createElement: () => ({
      getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn() }),
      toDataURL: () => "data:image/png;base64,UElD",
    }) });
    const model = { blocks: [{ type: "image", props: { src: "https://example.org/private.png" } }] };
    const result = format === "html" ? await exportSingleHtml(model, { imageLoader: fetchAndCleanImage }) : await exportSiteZip(model, { imageLoader: fetchAndCleanImage });
    const content = format === "html"
      ? await result.text()
      : await (await JSZip.loadAsync(await result.arrayBuffer())).file("index.html")!.async("string");
    expect(content).toContain("data:image/png;base64,UElD");
    expect(content).not.toContain(original);
    expect(content).not.toContain("https://example.org/private.png");
  });
});

it.each(["html", "zip"] as const)("без подтверждённого транспорта не запрашивает внешние изображения при экспорте %s", async format => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn() }), toDataURL: () => "data:image/png;base64,UElD" }) });
  try {
    const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "img", src: "https://example.org/private.png" }] });
    const result = format === "html" ? await exportSingleHtml(model) : await exportSiteZip(model);
    const html = format === "html" ? await result.text() : await (await JSZip.loadAsync(await result.arrayBuffer())).file("index.html")!.async("string");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain("data:image/png;base64,UElD");
    expect(html).not.toContain("https://example.org/private.png");
  } finally { vi.unstubAllGlobals(); }
});

it("запрещает внешние медиа в локальном просмотре", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "video", src: "https://example.org/movie.mp4" }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: true, restrictExternalMedia: true })).text();
  expect(html).toContain("img-src 'self' data:");
  expect(html).toContain("media-src 'self' data:");
  expect(html).not.toContain("media-src 'self' https:");
});

it("отклоняет SVG в data-изображениях и data-ссылки на кнопках", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "img", src: "data:image/svg+xml,<svg onload=alert(1)>" },
    { type: "btn", label: "Ссылка", href: "data:image/svg+xml,<svg onload=alert(1)>" },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).not.toContain("onload=alert");
  expect(html).toContain('class="responsive" src=""');
  expect(html).toContain('href="#"');
});

describe("экспорт вложенных контейнеров", () => {
  it.each(["html", "zip"] as const)("сохраняет содержимое, пропорции и скрывает скрытые блоки в %s", async format => {
    const model = adaptFromSiteBuilderDoc({ title: "Тест", blocks: [{
      id: "grid", type: "grid", layoutPreset: [2, 1], layoutCells: [
        [{ id: "one", type: "h1", text: "Первая колонка" }],
        [{ id: "section", type: "section", layoutPreset: [1], layoutCells: [[
          { id: "two", type: "p", text: "Вложенный текст" },
          { id: "hidden", type: "p", text: "Скрытый текст", hidden: true },
        ]] }],
      ],
    }] });
    const blob = format === "html" ? await exportSingleHtml(model, { bundleAssets: false }) : await exportSiteZip(model, { bundleAssets: false });
    const html = format === "html" ? await blob.text() : await (await JSZip.loadAsync(await blob.arrayBuffer())).file("index.html")!.async("string");
    expect(html).toContain("Первая колонка");
    expect(html).toContain("Вложенный текст");
    expect(html).not.toContain("Скрытый текст");
    expect(html).toContain('layout-cell layout-w-2');
    expect(html).toContain('layout-cell layout-w-1');
  });

  it("не теряет прежние изображения сетки при наличии вложенных ячеек", async () => {
    const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "grid", gapX: 22, gapY: 31, items: [{ src: "https://example.org/a.png", caption: "Старая галерея" }], layoutPreset: [1], layoutCells: [[{ type: "p", text: "Вложенный текст" }]] }] });
    const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
    expect(html).toContain("Старая галерея");
    expect(html).toContain("Вложенный текст");
    expect(html).toContain("sb-grid-0");
    expect(html).toContain("--gx:22px;--gy:31px");
    expect(html).not.toContain('style="--gx:');
  });

  it.each(["html", "zip"] as const)("обрабатывает ошибку изображения внутри контейнера при экспорте %s", async format => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn() }), toDataURL: () => "data:image/png;base64,UElD" }) });
    try {
      const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "grid", layoutPreset: [1], layoutCells: [[{ type: "img", src: "https://example.org/private.png" }]] }] });
      const result = format === "html" ? await exportSingleHtml(model, { imageLoader: fetchAndCleanImage }) : await exportSiteZip(model, { imageLoader: fetchAndCleanImage });
      const html = format === "html" ? await result.text() : await (await JSZip.loadAsync(await result.arrayBuffer())).file("index.html")!.async("string");
      expect(html).toContain("data:image/png;base64,UElD");
      expect(html).not.toContain("https://example.org/private.png");
    } finally { vi.unstubAllGlobals(); }
  });

  it.each(["html", "zip"] as const)("заменяет недоступные изображения галереи и двухколоночного блока в %s", async format => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn() }), toDataURL: () => "data:image/png;base64,UElD" }) });
    try {
      const model = adaptFromSiteBuilderDoc({ blocks: [
        { type: "grid", items: [{ src: "https://example.org/gallery.png" }] },
        { type: "cols2", img: "https://example.org/column.png" },
      ] });
      const progress: number[] = [];
      const result = format === "html" ? await exportSingleHtml(model, { imageLoader: fetchAndCleanImage, onProgress: done => progress.push(done) }) : await exportSiteZip(model, { imageLoader: fetchAndCleanImage, onProgress: done => progress.push(done) });
      const html = format === "html" ? await result.text() : await (await JSZip.loadAsync(await result.arrayBuffer())).file("index.html")!.async("string");
      expect(html.match(/data:image\/png;base64,UElD/g)).toHaveLength(2);
      expect(html).not.toContain("https://example.org/");
      expect(progress).toEqual([0, 1, 2]);
    } finally { vi.unstubAllGlobals(); }
  });
});

it("экспортирует основные информационные блоки и экранирует их содержимое", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "alert", variant: "warning", title: "Внимание", text: "<script>bad()</script>" },
    { type: "blockquote", text: "Цитата", cite: "Автор" },
    { type: "progress", label: "Готовность", value: 120 },
    { type: "counter", prefix: "≈", value: 42, suffix: "+" },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("notice-warning");
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  expect(html).not.toContain("<script>bad()</script>");
  expect(html).toContain("Цитата");
  expect(html).toContain("Автор");
  expect(html).toContain('max="100" value="100"');
  expect(html).toContain("≈42+");
  expect(html).not.toContain("[Неизвестный блок");
});

it("не вставляет произвольный CSS или HTML через цвет темы", async () => {
  const model = { title: "Тема", blocks: [], theme: { accent: "</style><div>INJECTED</div><style>", container: 999999 } };
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).not.toContain("INJECTED");
  expect(html).toContain("--accent:#5865F2");
  expect(html).toContain("max-width:2560px");
});

it("экспортирует исправленный адрес изображения из документа старого инспектора", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "img", cid: "https://example.org/old.png", src: "https://example.org/new.png", alt: "Новое" }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("https://example.org/new.png");
  expect(html).not.toContain("https://example.org/old.png");
});

it("сохраняет уровень заголовка, переносы абзаца и вариант кнопки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "heading", level: "h3", text: "Подзаголовок" },
    { type: "p", text: "Первая\nВторая" },
    { type: "btn", label: "Переход", href: "#next", variant: "ghost", align: "right" },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("<h3>Подзаголовок</h3>");
  expect(html).toContain("Первая<br/>Вторая");
  expect(html).toContain('class="btn ghost"');
  expect(html).toContain('class="section t-right"');
});

it("экспортирует безопасный адрес видео и его настройки без автозапуска", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "video", src: "https://example.org/movie.mp4", poster: "javascript:alert(1)", controls: true, muted: true, loop: true }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('src="https://example.org/movie.mp4"');
  expect(html).toContain('preload="none"');
  expect(html).toMatch(/<video[^>]*controls[^>]*loop[^>]*muted/);
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("autoplay");
});

it("сохраняет список с маркерами и очищает опасные ссылки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "iconlist", variant: "check", items: [
    { label: "Первый", description: "Описание", href: "https://example.org/" },
    { label: "<script>", href: "javascript:alert(1)" },
  ] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("icon-list-marker");
  expect(html).toContain("Описание");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("javascript:alert");
  expect(html).toContain('href="#"');
});

it("создаёт якорь и ссылку на него с одинаковым безопасным именем", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "btn", label: "К разделу", href: "#my-section" },
    { type: "anchor", name: "My Section" },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('href="#my-section"');
  expect(html).toContain('id="my-section"');
});

it("показывает код как текст, не исполняя HTML", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "code", lang: "html", code: '<img src=x onerror="bad()">' }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('class="language-html"');
  expect(html).toContain('&lt;img src=x onerror=&quot;bad()&quot;&gt;');
  expect(html).not.toContain('<img src=x onerror="bad()">');
});

it("сохраняет текст, безопасную кнопку и оформление призыва", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "cta", title: "Заголовок", text: "Первая\nВторая", btnLabel: "Перейти", btnHref: "javascript:alert(1)", variant: "outline", align: "center", emphasis: "brand" }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("cta cta-center cta-brand");
  expect(html).toContain("cta-button-outline");
  expect(html).toContain("Первая<br/>Вторая");
  expect(html).toContain('href="#"');
  expect(html).not.toContain("javascript:alert");
});

it("сохраняет пропорции и порядок двух колонок и не создаёт пустую кнопку героя", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "hero", title: "Заголовок", ctaText: "" },
    { type: "cols2", title: "Текст", text: "Описание", img: "https://example.org/a.png", ratio: "5-7", reverse: true },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('c-md-5 order-2');
  expect(html).toContain('c-md-7 order-1');
  expect(html).not.toContain('class="btn" href=');
});

it("экспортирует галерею в заданном порядке с описаниями изображений", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "gallery", cols: 4, items: [
    { src: "https://example.org/first.png", alt: "Первое" },
    { src: "https://example.org/second.png", alt: "Второе" },
  ] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("grid-wrap gc-4");
  expect(html.indexOf("first.png")).toBeLessThan(html.indexOf("second.png"));
  expect(html).toContain('alt="Первое"');
  expect(html).toContain('alt="Второе"');
});

it("создаёт ручное оглавление со ссылками на якоря", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "toc", items: [{ label: "Раздел", href: "#section-1" }, { label: "Опасная ссылка", href: "javascript:alert(1)" }] },
    { type: "anchor", name: "section-1" },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('href="#section-1"');
  expect(html).toContain('id="section-1"');
  expect(html).not.toContain("javascript:alert");
});

it("экспортирует навигационную цепочку с обозначением текущей страницы", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "breadcrumbs", separator: "›", items: [{ label: "Главная", href: "/" }, { label: "Страница", href: "javascript:alert(1)" }] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('href="/"');
  expect(html).toContain('<span aria-current="page">Страница</span>');
  expect(html).not.toContain("javascript:alert");
});

it("сохраняет контейнер, его оформление и вложенный контент", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "container", width: "sm", padding: "lg", bg: "brand", border: true, rounded: true, layoutPreset: [1], layoutCells: [[{ type: "p", text: "Внутри контейнера" }]] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("sb-container-sm sb-container-pad-lg sb-container-bg-brand sb-container-border sb-container-rounded");
  expect(html).toContain("Внутри контейнера");
});

it("сохраняет вложенные пункты меню, их порядок и безопасные ссылки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "menu", orientation: "vertical", activeHref: "#a", items: [
    { label: "Первый", href: "#a", children: [{ label: "Вложенный", href: "javascript:alert(1)" }] },
    { label: "Второй", href: "/next" },
  ] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("site-menu-vertical");
  expect(html).toContain('href="#a" aria-current="page"');
  expect(html).toContain("site-menu-children");
  expect(html.indexOf("Первый")).toBeLessThan(html.indexOf("Вложенный"));
  expect(html.indexOf("Вложенный")).toBeLessThan(html.indexOf("Второй"));
  expect(html).not.toContain("javascript:alert");
});

it("экспортирует реальные данные одиночных карточек и старых наборов", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "iconbox", title: "Защита", text: "Описание", icon: "shield" },
    { type: "imagebox", src: "https://example.org/real.png", title: "Настоящая карточка", alt: "Подпись" },
    { type: "imagebox", columns: 2, items: [{ src: "https://example.org/a.png", title: "Старая карточка" }] },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("Защита");
  expect(html).toContain("Настоящая карточка");
  expect(html).toContain('alt="Подпись"');
  expect(html).toContain("site-cards-2");
  expect(html).toContain("Старая карточка");
  expect(html).not.toContain("Функция A");
});

it("экспортирует выбранную иконку с размером и цветом", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "icon", name: "heart", size: "lg", color: "text-[#ef4444]" }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('class="site-icon-red" width="32" height="32"');
  expect(html).toContain('aria-label="Сердце"');
});

it("экспортирует независимые рейтинги с выбранным значением и режимом просмотра", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "rating", value: 3, max: 5 }, { type: "rating", value: 2, max: 3, readonly: true }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('id="sb-rating-0-3" name="sb-rating-0" value="3" aria-label="3 из 5" checked');
  expect(html).toContain('id="sb-rating-1-2" name="sb-rating-1" value="2" aria-label="2 из 3" checked disabled');
});

it("экспортирует реальные отзывы, тарифы и безопасные ссылки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "testimonials", items: [{ author: "Мария", text: "Настоящий отзыв", role: "Дизайнер" }] },
    { type: "pricelist", items: [{ title: "Тариф", price: "900 ₽", desc: "Описание", features: ["Пункт"], ctaLabel: "Выбрать", ctaHref: "javascript:alert(1)" }] },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  for (const text of ["Мария", "Настоящий отзыв", "Дизайнер", "Тариф", "900 ₽", "Описание", "Пункт"]) expect(html).toContain(text);
  expect(html).not.toContain("javascript:alert");
});

it("экспортирует поиск для обработчика сайта и отклоняет внешний адрес", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "search", action: "/search", method: "GET", placeholder: "Найти" },
    { type: "search", action: "//other.example/search", method: "POST" },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('action="/search" method="get"');
  expect(html).toContain('action="#" method="post"');
  expect(html).toContain('placeholder="Найти"');
  expect(html).not.toContain("other.example");
});

it("экспортирует социальные ссылки и не сохраняет опасные адреса", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "social", items: [{ label: "Сообщество", href: "https://example.org/page" }, { label: "Опасно", href: "javascript:alert(1)" }] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('href="https://example.org/page"');
  expect(html).toContain("Сообщество");
  expect(html).toContain("Опасно");
  expect(html).not.toContain("javascript:alert");
});

it("сохраняет этапы и отмечает текущий для экранного диктора", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "progresstracker", current: 1, steps: [{ label: "Начало" }, { label: "Проверка" }, { label: "Готово" }] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('aria-current="step"');
  expect(html).toContain("Проверка");
  expect(html.indexOf("Начало")).toBeLessThan(html.indexOf("Готово"));
});

it("обнаруживает неподдерживаемые виджеты во вложенных контейнерах", () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "container", layoutCells: [[{ type: "lottie" }, { type: "lottie" }]] }] });
  expect(unsupportedBlockTypes(model)).toEqual(["lottie"]);
});

it("экспортирует навигацию по страницам с корректными ссылками", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "pagination", current: 2, total: 3, baseHref: "/page?n=" }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('href="/page?n=2" aria-current="page"');
  expect(html).toContain('href="/page?n=3"');
});

it("сохраняет ширину, сторону и безопасные ссылки боковой панели", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "sidebar", title: "Разделы", side: "right", width: 300, items: [{ label: "Документы", href: "/docs" }, { label: "Плохая ссылка", href: "javascript:alert(1)" }] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("site-sidebar-right sb-sidebar-0");
  expect(html).toContain(".sb-sidebar-0{max-width:300px}");
  expect(html).toContain('href="/docs"');
  expect(html).not.toContain("javascript:alert");
});

it("экспортирует переключаемые вкладки с уникальными группами и безопасным содержимым", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [
    { type: "tabs", active: 0, orientation: "vertical", tabs: [{ label: "Недоступна", disabled: true }, { label: "Доступна", content: "<script>bad()</script>" }] },
    { type: "tabs", tabs: [{ label: "Другая", content: "Текст" }] },
  ] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('name="sb-tabs-0" id="sb-tabs-0-tab-0" aria-controls="sb-tabs-0-panel-0" disabled');
  expect(html).toContain('name="sb-tabs-0" id="sb-tabs-0-tab-1" aria-controls="sb-tabs-0-panel-1" checked');
  expect(html).toContain('name="sb-tabs-1"');
  expect(html).toContain('.sb-tabs-0:has(#sb-tabs-0-tab-1:checked) #sb-tabs-0-panel-1{display:block}');
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  expect(html).not.toContain("<script>bad()</script>");
});

it.each(["html", "zip"] as const)("разрешает только проверенный обработчик аккордеона при экспорте %s", async format => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "accordion", allowMultiple: false, allowToggle: false, items: [{ title: "Первый", content: "<script>bad()</script>", open: false }, { title: "Второй", content: "Текст", open: false }] }] });
  const blob = format === "html" ? await exportSingleHtml(model, { bundleAssets: false }) : await exportSiteZip(model, { bundleAssets: false });
  const html = format === "html" ? await blob.text() : await (await JSZip.loadAsync(await blob.arrayBuffer())).file("index.html")!.async("string");
  expect(html).toContain(`script-src 'sha256-${SITE_RUNTIME_HASH}'`);
  expect(html).toContain(`<script>${SITE_RUNTIME}</script>`);
  expect(html).toContain('aria-expanded="true" aria-controls="sb-accordion-0-panel-0"');
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  expect(html).not.toContain("<script>bad()</script>");
});

it("подготавливает безопасное распространение ссылки без обращения к сторонним сайтам при загрузке", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "share", url: "javascript:alert(1)", networks: ["copy", "telegram", "unknown"] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('data-share data-url=""');
  expect(html).toContain('data-share-action="copy"');
  expect(html).toContain('data-share-action="telegram"');
  expect(html).not.toContain('data-share-action="unknown"');
  expect(html).not.toContain("javascript:alert");
  expect(html).toContain(`script-src 'sha256-${SITE_RUNTIME_HASH}'`);
});

it("экспортирует навигацию по якорям и подключает проверенный scrollspy только при необходимости", async () => {
  const blocks = [{ type: "contentnav", spy: true, spyOffset: 120, activeHref: "#first", items: [{ label: "Первый", href: "#first" }, { label: "Опасный", href: "javascript:alert(1)" }] }, { type: "p", text: "Раздел", anchorId: "first" }];
  const html = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ blocks }), { bundleAssets: false })).text();
  expect(html).toContain('data-contentnav data-spy="true" data-offset="120"');
  expect(html).toContain('href="#first" aria-current="location"');
  expect(html).toContain('id="first"');
  expect(html).toContain(`script-src 'sha256-${SITE_RUNTIME_HASH}'`);
  expect(html).not.toContain("javascript:alert");
  const staticHtml = await (await exportSingleHtml(adaptFromSiteBuilderDoc({ blocks: [{ ...blocks[0], spy: false }] }), { bundleAssets: false })).text();
  expect(staticHtml).toContain("script-src 'none'");
});

it("без DOM закрытым образом выводит HTML как текст", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "html", html: '<img src=x onerror="bad()"><script>bad()</script>' }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).not.toContain('<img src=x onerror="bad()">');
  expect(html).not.toContain("<script>bad()</script>");
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
});

it("экспортирует карусель с начальным слайдом и защищёнными подписями", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "carousel", initial: 1, slides: [{ src: "data:image/png;base64,UElD", caption: "Первый" }, { src: "data:image/png;base64,UElD", caption: "<Второй>" }] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('data-carousel-slide hidden');
  expect(html).toContain("Слайд 2 из 2");
  expect(html).toContain("&lt;Второй&gt;");
  expect(html).toContain(`script-src 'sha256-${SITE_RUNTIME_HASH}'`);
});

it("выводит безопасную дату отсчёта и сообщение об ошибке для неверной даты", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "countdown", target: "2030-01-01T00:00:00.000Z" }, { type: "countdown", target: '<img onerror="bad()">' }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('data-target="2030-01-01T00:00:00.000Z"');
  expect(html).toContain("Неверная дата");
  expect(html).not.toContain('<img onerror="bad()">');
});

it("сохраняет текстовые слайды и очищает их ссылки", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "slides", initial: 1, slides: [{ title: "Первый", ctaLabel: "Переход", ctaHref: "javascript:alert(1)" }, { title: "Второй", text: "Описание" }] }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("Первый");
  expect(html).toContain("Второй");
  expect(html).toContain("Слайд 2 из 2");
  expect(html).not.toContain("javascript:alert");
});

it("экспортирует доступную панель с безопасным текстом и настроенной шириной", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "offcanvas", title: "Меню", body: "<script>bad()</script>", side: "right", width: 420 }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain('data-drawer-open="sb-drawer-0"');
  expect(html).toContain('class="site-drawer site-drawer-right sb-drawer-0"');
  expect(html).toContain(".sb-drawer-0{width:420px}");
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
});

it.each(["html", "zip"] as const)("сохраняет безопасные адаптивные стили вложенных блоков в %s", async format => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "grid", layoutPreset: [1], layoutCells: [[{
    type: "p", text: "Стили", className: "my-block bad\"class", anchorId: "test-block",
    styleByBp: { desktop: { pt: 24, bg: "#aabbcc" }, tablet: { pt: 12 }, mobile: { pt: 4, bg: "red;}</style><script>bad()</script>" } },
  }]] }] });
  const blob = format === "html" ? await exportSingleHtml(model, { bundleAssets: false }) : await exportSiteZip(model, { bundleAssets: false });
  const zip = format === "zip" ? await JSZip.loadAsync(await blob.arrayBuffer()) : undefined;
  const html = zip ? await zip.file("index.html")!.async("string") : await blob.text();
  const css = zip ? await zip.file("styles.css")!.async("string") : html;
  expect(html).toContain('class="sb-style-1 my-block" id="test-block"');
  expect(css).toContain("padding-top:24px;background-color:#aabbcc");
  expect(css).toContain("@media(max-width:1024px){.sb-style-1{padding-top:12px;background-color:#aabbcc}}");
  expect(css).toContain("@media(max-width:767px){.sb-style-1{padding-top:4px}}");
  expect(css).not.toContain("bad()</script>");
});

it("создаёт безопасные правила типографики для текста", async () => {
  const model = adaptFromSiteBuilderDoc({ blocks: [{ type: "p", text: "Абзац", styleByBp: { desktop: { fs: 26, fw: 700, lh: 1.5, tc: "#123456", ta: "center" } } }] });
  const html = await (await exportSingleHtml(model, { bundleAssets: false })).text();
  expect(html).toContain("font-size:26px;font-weight:700;line-height:1.5;color:#123456;text-align:center");
  expect(html).toContain(".sb-style-0>section>:is(h1,h2,h3,h4,h5,h6,div,span,p,a){font-size:inherit;font-weight:inherit;line-height:inherit;color:inherit!important}");
});
