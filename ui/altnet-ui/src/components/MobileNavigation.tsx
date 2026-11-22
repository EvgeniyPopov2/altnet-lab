import { Home, MessageCircle, MoreHorizontal, Server, ShieldCheck } from "lucide-react";

export type MobileSection = "feed" | "messages" | "servers" | "security" | "more";

type Props = {
  active: string;
  onNavigate: (section: MobileSection) => void;
};

const items = [
  { id: "feed", label: "Лента", Icon: Home },
  { id: "messages", label: "Чаты", Icon: MessageCircle },
  { id: "servers", label: "Серверы", Icon: Server },
  { id: "security", label: "Защита", Icon: ShieldCheck },
  { id: "more", label: "Ещё", Icon: MoreHorizontal },
] as const;

export default function MobileNavigation({ active, onNavigate }: Props) {
  return (
    <nav aria-label="Основные разделы" className="altnet-mobile-nav">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="altnet-mobile-nav__item"
          aria-current={active === id ? "page" : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
