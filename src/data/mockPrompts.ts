export interface Prompt {
  id: string;
  title: string;
  description: string;
  group: string;
  script: string;
  date: string;
  isDemo?: boolean;
}

export const GROUPS = [
  "Demo",
  "Art & Design",
  "Business & Strategy",
  "Creative Writing",
  "Education",
  "Finance",
  "Food",
  "General & Uncategorized",
  "Health",
  "Marketing",
  "Music",
  "News",
  "Software Dev",
  "Tech & Science",
];

export const PROMPTS: Prompt[] = [
  {
    id: "1",
    title: "Product Launch Strategy",
    description: "Multi-agent discussion to plan a comprehensive product launch campaign",
    group: "Demo",
    script: "Welcome to the Product Launch Strategy conference. Today we'll discuss go-to-market strategies, messaging, and channel selection for our upcoming product launch.",
    date: "2024-01-15",
    isDemo: true,
  },
  {
    id: "2",
    title: "UI/UX Design Review",
    description: "Collaborative design critique and improvement suggestions",
    group: "Art & Design",
    script: "Let's review the current UI/UX designs and discuss improvements to enhance user experience and visual appeal.",
    date: "2024-01-14",
  },
  {
    id: "3",
    title: "Market Research Analysis",
    description: "Analyze market trends and competitive landscape",
    group: "Business & Strategy",
    script: "We'll analyze current market trends, identify opportunities, and discuss competitive positioning strategies.",
    date: "2024-01-13",
  },
  {
    id: "4",
    title: "Novel Character Development",
    description: "Brainstorm and develop compelling characters for fiction writing",
    group: "Creative Writing",
    script: "Let's create memorable characters with depth, motivation, and compelling story arcs.",
    date: "2024-01-12",
  },
  {
    id: "5",
    title: "Curriculum Planning Session",
    description: "Design an engaging educational curriculum",
    group: "Education",
    script: "We'll develop a comprehensive curriculum that balances theory, practice, and student engagement.",
    date: "2024-01-11",
  },
  {
    id: "6",
    title: "Investment Portfolio Review",
    description: "Analyze and optimize investment strategies",
    group: "Finance",
    script: "Let's review current portfolio performance and discuss rebalancing strategies for optimal returns.",
    date: "2024-01-10",
  },
  {
    id: "7",
    title: "Recipe Development Workshop",
    description: "Create and refine new culinary recipes",
    group: "Food",
    script: "We'll explore flavor combinations, techniques, and presentation to create exceptional dishes.",
    date: "2024-01-09",
  },
  {
    id: "8",
    title: "Code Architecture Review",
    description: "Review and improve software architecture decisions",
    group: "Software Dev",
    script: "Let's evaluate our current architecture, identify bottlenecks, and discuss scalability improvements.",
    date: "2024-01-08",
    isDemo: true,
  },
  {
    id: "9",
    title: "Content Marketing Strategy",
    description: "Plan content calendar and distribution strategy",
    group: "Marketing",
    script: "We'll develop a content strategy that aligns with our brand voice and engages our target audience.",
    date: "2024-01-07",
  },
  {
    id: "10",
    title: "AI Research Discussion",
    description: "Explore latest developments in artificial intelligence",
    group: "Tech & Science",
    script: "Let's discuss recent AI breakthroughs, their implications, and future research directions.",
    date: "2024-01-06",
  },
  {
    id: "11",
    title: "Wellness Program Design",
    description: "Create a comprehensive employee wellness initiative",
    group: "Health",
    script: "We'll design a holistic wellness program that addresses physical, mental, and emotional health.",
    date: "2024-01-05",
  },
  {
    id: "12",
    title: "Music Production Collaboration",
    description: "Discuss arrangement, mixing, and production techniques",
    group: "Music",
    script: "Let's collaborate on production techniques, sound design, and arrangement choices for this track.",
    date: "2024-01-04",
  },
  {
    id: "13",
    title: "News Editorial Meeting",
    description: "Plan coverage and editorial direction for upcoming stories",
    group: "News",
    script: "We'll discuss story angles, sources, and editorial priorities for this week's coverage.",
    date: "2024-01-03",
  },
  {
    id: "14",
    title: "Brand Identity Workshop",
    description: "Define and refine brand identity elements",
    group: "Art & Design",
    script: "Let's develop a cohesive brand identity that reflects our values and resonates with our audience.",
    date: "2024-01-02",
  },
  {
    id: "15",
    title: "General Brainstorming",
    description: "Open-ended ideation and creative problem solving",
    group: "General & Uncategorized",
    script: "Welcome to an open brainstorming session. Share ideas, explore possibilities, and think creatively.",
    date: "2024-01-01",
    isDemo: true,
  },
];
