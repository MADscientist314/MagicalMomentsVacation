// The four tools Jillian sees, and the form fields each one asks for.
// The UI renders forms from this; the Worker validates requests against it.

export type ToolId = "magic-mail" | "welcome-center" | "spread-the-magic" | "adventure-planner";

export interface FieldDef {
  id: string;
  label: string;
  kind: "text" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  maxLength: number;
}

export interface ToolDef {
  id: ToolId;
  name: string;
  subtitle: string;
  /** Tabler icon name, without the `ti-` prefix. */
  icon: string;
  effort: "medium" | "high";
  webSearch: boolean;
  /** Show the "For Jillian only" notes above the client text. */
  notesFirst: boolean;
  fields: FieldDef[];
}

export interface DraftRequest {
  tool: ToolId;
  fields: Record<string, string>;
  refinements?: { draft: string; request: string }[];
}

export const TOOLS: Record<ToolId, ToolDef> = {
  "magic-mail": {
    id: "magic-mail",
    name: "Magic Mail",
    subtitle: "Client emails",
    icon: "mail-heart",
    effort: "medium",
    webSearch: false,
    notesFirst: false,
    fields: [
      {
        id: "emailType",
        label: "Which email?",
        kind: "select",
        options: ["Welcome", "Payment reminder", "Pre-trip", "Welcome home", "Something else"],
        required: true,
        maxLength: 40,
      },
      { id: "clientNames", label: "Client names", kind: "text", required: true, placeholder: "The Rivera family", maxLength: 200 },
      { id: "trip", label: "Destination and dates", kind: "text", placeholder: "Walt Disney World, June 8–14", maxLength: 300 },
      {
        id: "details",
        label: "Anything to include",
        kind: "textarea",
        placeholder: "Final payment due May 1. Staying at Pop Century. First trip for the kids.",
        maxLength: 4000,
      },
    ],
  },
  "welcome-center": {
    id: "welcome-center",
    name: "Welcome Center",
    subtitle: "Review a new inquiry",
    icon: "door-enter",
    effort: "medium",
    webSearch: false,
    notesFirst: true,
    fields: [
      {
        id: "inquiry",
        label: "Paste the inquiry or Fillout submission",
        kind: "textarea",
        required: true,
        maxLength: 12000,
      },
    ],
  },
  "spread-the-magic": {
    id: "spread-the-magic",
    name: "Spread the Magic",
    subtitle: "Marketing posts",
    icon: "wand",
    effort: "medium",
    webSearch: true,
    notesFirst: false,
    fields: [
      {
        id: "channel",
        label: "Where will it go?",
        kind: "select",
        options: ["Facebook post", "Instagram caption", "Newsletter", "Website promo"],
        required: true,
        maxLength: 40,
      },
      { id: "topic", label: "What's it about?", kind: "text", required: true, placeholder: "Booking fall 2027 cruises early", maxLength: 300 },
      { id: "promo", label: "Promotion details (if any)", kind: "textarea", maxLength: 4000 },
    ],
  },
  "adventure-planner": {
    id: "adventure-planner",
    name: "Adventure Planner",
    subtitle: "Trip plans",
    icon: "map-2",
    effort: "high",
    webSearch: true,
    notesFirst: false,
    fields: [
      {
        id: "destination",
        label: "Destination",
        kind: "select",
        options: ["Walt Disney World", "Universal Orlando", "Royal Caribbean cruise", "All-inclusive resort"],
        required: true,
        maxLength: 60,
      },
      { id: "dates", label: "Travel dates", kind: "text", required: true, placeholder: "March 14–20, 2027", maxLength: 200 },
      { id: "party", label: "Who's going (ages)", kind: "text", required: true, placeholder: "2 adults, kids 6 and 9", maxLength: 300 },
      { id: "resort", label: "Resort or ship", kind: "text", maxLength: 200 },
      { id: "priorities", label: "Must-dos and priorities", kind: "textarea", maxLength: 4000 },
    ],
  },
};

export function isToolId(x: unknown): x is ToolId {
  return typeof x === "string" && Object.hasOwn(TOOLS, x);
}
