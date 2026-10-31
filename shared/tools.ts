// The tools Jillian sees on the home screen, and the form fields each one asks for.
// The UI renders forms from this; the Worker validates requests against it.

export type ToolId = "magic-mail" | "welcome-center" | "inbox-helper" | "spread-the-magic" | "adventure-planner";

export interface FieldDef {
  id: string;
  label: string;
  /** "choice" shows the options as one-click buttons; blank means the first option. */
  kind: "text" | "textarea" | "select" | "choice";
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
  "inbox-helper": {
    id: "inbox-helper",
    name: "Inbox Helper",
    subtitle: "Prioritize and reply",
    icon: "inbox",
    effort: "medium",
    webSearch: false,
    notesFirst: true,
    fields: [
      {
        id: "need",
        label: "What do you need?",
        kind: "choice",
        options: [
          "Reply to these emails",
          "New client welcome",
          "Check in (hasn't booked)",
          "Pre-trip reminder",
          "Itinerary and quote",
          "Payment reminder",
          "Welcome home",
        ],
        maxLength: 40,
      },
      {
        id: "emails",
        label: "Paste the email thread, or jot down the client, trip and what to include",
        kind: "textarea",
        required: true,
        placeholder: "Paste one or more emails (who they're from, the subject and the message), or a few notes like: Katie, Universal in June, final payment due May 1.",
        maxLength: 20000,
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
        options: [
          "Walt Disney World",
          "Disneyland",
          "Universal Orlando",
          "Disney Cruise Line",
          "Royal Caribbean cruise",
          "Other cruise",
          "All-inclusive resort",
          "Adventures by Disney",
          "Other",
        ],
        required: true,
        maxLength: 60,
      },
      { id: "dates", label: "Travel dates", kind: "text", required: true, placeholder: "March 14–20, 2027", maxLength: 200 },
      { id: "party", label: "Who's going (ages)", kind: "text", required: true, placeholder: "2 adults, kids 6 and 9", maxLength: 300 },
      { id: "resort", label: "Resort, ship or place", kind: "text", placeholder: "Polynesian Village, Viking Rhine cruise…", maxLength: 200 },
      { id: "priorities", label: "Must-dos and priorities", kind: "textarea", maxLength: 4000 },
    ],
  },
};

/** The tiles on the home screen, in the order Jillian works. Magic Mail's emails now live in Inbox Helper. */
export const HOME_TOOLS: ToolId[] = ["welcome-center", "inbox-helper", "adventure-planner", "spread-the-magic"];

export function isToolId(x: unknown): x is ToolId {
  return typeof x === "string" && Object.hasOwn(TOOLS, x);
}
