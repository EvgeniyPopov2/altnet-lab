// src/screens/SiteBuilder/blocks/index.tsx
import type { Block } from "../types";
import H1View from "./h1/view";
import PView from "./p/view";
import BtnView from "./btn/view";
import ImgView from "./img/view";
import DividerView from "./divider/view";
import SpacerView from "./spacer/view";
import HeadingView from "./heading/view";
import HeroView from "./hero/view";
import Cols2View from "./cols2/view";
import SectionView from "./section/view";
import GridView from "./grid/view";
import IconView from "./icon/view";
import IconListView from "./iconlist/view";
import AlertView from "./alert/view";
import HtmlView from "./html/view";
import CodeView from "./code/view";
import TabsView from "./tabs/view";
import AccordionView from "./accordion/view";
import BlockquoteView from "./blockquote/view";
import CtaView from "./cta/view";
import RatingView from "./rating/view";
import CounterView from "./counter/view";
import ProgressView from "./progress/view";
import BreadcrumbsView from "./breadcrumbs/view";
import PaginationView from "./pagination/view";
import SocialView from "./social/view";
import IconBoxView from "./iconbox/view";
import ImageBoxView from "./imagebox/view";

/** Возвращает React-элемент превью для любого блока. */
export function renderBlockView(b: Block) {
  switch (b.type) {
    case "h1":      return <H1View block={b} />;
    case "heading": return <HeadingView block={b} />;
    case "p":       return <PView block={b} />;
    case "btn":     return <BtnView block={b} />;
    case "img":     return <ImgView block={b} />;
    case "divider": return <DividerView block={b} />;
    case "spacer":  return <SpacerView block={b} />;
    case "hero":    return <HeroView block={b} />;
    case "cols2":   return <Cols2View block={b} />;
    case "section": return <SectionView block={b} />;
    case "grid":    return <GridView block={b} />;
    case "icon":    return <IconView block={b} />;
    case "iconlist":return <IconListView block={b} />;
    case "alert":   return <AlertView block={b} />;
    case "html":    return <HtmlView block={b} />;
    case "code":    return <CodeView block={b} />;
    case "tabs":       return <TabsView block={b} />;
    case "accordion":  return <AccordionView block={b} />;
    case "blockquote": return <BlockquoteView block={b} />;
    case "cta":        return <CtaView block={b} />;
    case "rating":     return <RatingView block={b} />;
    case "counter":     return <CounterView block={b} />;
    case "progress":    return <ProgressView block={b} />;
    case "breadcrumbs": return <BreadcrumbsView block={b} />;
    case "pagination":  return <PaginationView block={b} />;
    case "social":      return <SocialView block={b} />;
    case "iconbox":     return <IconBoxView block={b} />;
    case "imagebox":    return <ImageBoxView block={b} />;
    default:
      return <div className="text-sm text-[#6b7390]">Превью для блока пока не реализовано.</div>;
  }
}
