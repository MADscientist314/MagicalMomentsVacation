// Every brains/ file, bundled into the Worker at build time.
import voice from "../brains/reference/voice.md?raw";
import business from "../brains/reference/business.md?raw";
import compliance from "../brains/reference/compliance.md?raw";
import bookingWindows from "../brains/reference/booking-windows.md?raw";
import fitRules from "../brains/reference/fit-rules.md?raw";
import magicMail from "../brains/skills/magic-mail/SKILL.md?raw";
import welcomeCenter from "../brains/skills/welcome-center/SKILL.md?raw";
import spreadTheMagic from "../brains/skills/spread-the-magic/SKILL.md?raw";
import adventurePlanner from "../brains/skills/adventure-planner/SKILL.md?raw";

export const BRAINS: Record<string, string> = {
  "reference/voice": voice,
  "reference/business": business,
  "reference/compliance": compliance,
  "reference/booking-windows": bookingWindows,
  "reference/fit-rules": fitRules,
  "skills/magic-mail": magicMail,
  "skills/welcome-center": welcomeCenter,
  "skills/spread-the-magic": spreadTheMagic,
  "skills/adventure-planner": adventurePlanner,
};
