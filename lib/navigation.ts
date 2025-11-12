import {
  BookText,
  History,
  Mic,
  Settings as SettingsIcon,
} from "lucide-react";

export const appNavItems = [
  { href: "/dictation", label: "Dictation", icon: Mic },
  { href: "/history", label: "History", icon: History },
  { href: "/dictionary", label: "Dictionary", icon: BookText },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

