/**
 * BELONG topic taxonomy. Signals are expressed against these normalised
 * topics, so the agent network exchanges generalised labels rather than a
 * member's own words. `related` powers the local semantic matcher;
 * `complements` powers complementary-interest matching.
 */
export type TopicCategory =
  | "outdoors"
  | "movement"
  | "food"
  | "arts"
  | "music"
  | "words"
  | "making"
  | "play"
  | "mind"
  | "community"
  | "work"
  | "life";

export interface Topic {
  id: string;
  label: string;
  category: TopicCategory;
  keywords: string[];
  related?: string[];
  complements?: string[];
  /** A life stage rather than an interest: chosen separately, never shown as an interest. */
  stage?: boolean;
  /** How a shared life stage is described to both members, e.g. "You're both new to the area". */
  phrase?: string;
}

/** Life stages: shared circumstances often bond people faster than shared hobbies. */
const stage = (id: string, label: string, phrase: string, keywords: string[], related: string[] = []): Topic => ({
  id,
  label,
  category: "life",
  keywords,
  related,
  complements: [],
  stage: true,
  phrase,
});

const t = (
  id: string,
  label: string,
  category: TopicCategory,
  keywords: string[],
  related: string[] = [],
  complements: string[] = [],
): Topic => ({ id, label, category, keywords, related, complements });

export const TOPIC_LIST: Topic[] = [
  t("hiking", "hiking", "outdoors", ["hike", "hiking", "hill walk", "hillwalking", "trail", "rambling", "long walk", "peak district", "fells"], ["wild-swimming", "camping", "birdwatching", "running"], ["photography"]),
  t("wild-swimming", "wild swimming", "outdoors", ["wild swim", "wild swimming", "open water", "cold water", "sea swim", "lido"], ["hiking", "camping", "yoga"], ["photography"]),
  t("camping", "camping", "outdoors", ["camping", "campsite", "tent", "bothy"], ["hiking", "wild-swimming", "astronomy"]),
  t("birdwatching", "birdwatching", "outdoors", ["birdwatching", "birding", "bird watching", "rspb"], ["hiking", "gardening"], ["photography"]),
  t("gardening", "gardening", "outdoors", ["garden", "gardening", "allotment", "growing veg", "houseplants", "plants"], ["birdwatching", "sustainability"], ["cooking"]),
  t("astronomy", "stargazing", "outdoors", ["astronomy", "stargazing", "telescope", "night sky"], ["camping", "science"]),
  t("running", "running", "movement", ["running", "parkrun", "jogging", "couch to 5k", "half marathon", "marathon"], ["hiking", "cycling"]),
  t("cycling", "cycling", "movement", ["cycling", "bike ride", "bikepacking", "road bike", "gravel bike"], ["running", "hiking"]),
  t("climbing", "climbing", "movement", ["climbing", "bouldering", "climbing wall"], ["hiking", "yoga"]),
  t("yoga", "yoga", "movement", ["yoga", "pilates"], ["mindfulness", "climbing", "wild-swimming"]),
  t("dance", "dancing", "movement", ["dance", "dancing", "salsa", "swing dance", "ceilidh", "lindy hop"], ["live-music"]),
  t("football", "football", "movement", ["football", "five-a-side", "5-a-side"], ["running"]),
  t("cooking", "cooking", "food", ["cooking", "cook", "recipe", "supper club", "dinner party"], ["baking", "food-markets"], ["gardening"]),
  t("baking", "baking", "food", ["baking", "bake", "sourdough", "bread", "pastry"], ["cooking", "coffee"]),
  t("coffee", "coffee", "food", ["coffee", "espresso", "café", "cafe hopping"], ["baking", "food-markets"]),
  t("food-markets", "food markets", "food", ["food market", "street food", "farmers market", "restaurants", "trying new restaurants"], ["cooking", "coffee"]),
  t("photography", "photography", "arts", ["photography", "photograph", "camera", "film camera", "35mm"], ["film", "painting"], ["hiking", "writing", "birdwatching", "wild-swimming"]),
  t("film", "film", "arts", ["cinema", "films", "movies", "film club", "documentaries"], ["theatre", "photography"]),
  t("theatre", "theatre", "arts", ["theatre", "plays", "improv", "amateur dramatics"], ["film", "live-music"]),
  t("painting", "painting & drawing", "arts", ["painting", "watercolour", "drawing", "sketching", "life drawing", "illustration"], ["pottery", "museums", "photography"], ["writing"]),
  t("museums", "museums & galleries", "arts", ["museum", "gallery", "galleries", "exhibition"], ["painting", "history"]),
  t("live-music", "live music", "music", ["live music", "gigs", "concert", "festival", "jazz night", "open mic"], ["guitar", "singing", "dance"]),
  t("guitar", "guitar", "music", ["guitar", "ukulele", "bass guitar"], ["live-music", "singing", "piano"], ["singing"]),
  t("piano", "piano", "music", ["piano", "keyboard"], ["guitar", "singing"], ["singing"]),
  t("singing", "singing", "music", ["singing", "choir", "sing"], ["live-music", "guitar", "piano"], ["guitar", "piano"]),
  t("writing", "writing", "words", ["writing", "novel", "short stories", "journaling", "blog", "screenwriting"], ["reading", "poetry"], ["painting", "photography"]),
  t("poetry", "poetry", "words", ["poetry", "poems", "spoken word"], ["writing", "reading"]),
  t("reading", "reading", "words", ["reading", "books", "book club", "novels", "fiction", "bookshop"], ["writing", "poetry", "philosophy"]),
  t("languages", "learning languages", "words", ["spanish", "french", "italian", "german", "japanese", "language exchange", "learning a language", "welsh", "bsl"], ["travel"]),
  t("pottery", "pottery", "making", ["pottery", "ceramics", "wheel throwing"], ["painting", "crafts"]),
  t("crafts", "knitting & crafts", "making", ["knitting", "crochet", "sewing", "embroidery", "crafts", "craft"], ["pottery", "woodworking"]),
  t("woodworking", "woodworking", "making", ["woodworking", "woodwork", "carpentry", "furniture restoration", "whittling"], ["crafts"]),
  t("board-games", "board games", "play", ["board game", "board games", "tabletop", "dungeons and dragons", "d&d", "catan"], ["video-games", "chess", "pub-quiz"]),
  t("video-games", "video games", "play", ["video games", "gaming", "nintendo", "playstation", "co-op games"], ["board-games"]),
  t("chess", "chess", "play", ["chess"], ["board-games"]),
  t("pub-quiz", "pub quizzes", "play", ["pub quiz", "quiz night", "trivia"], ["board-games"]),
  t("mindfulness", "mindfulness", "mind", ["meditation", "mindfulness", "breathwork"], ["yoga", "philosophy"]),
  t("philosophy", "philosophy & big ideas", "mind", ["philosophy", "big ideas", "ethics", "deep conversations"], ["reading", "mindfulness", "history"]),
  t("history", "history", "mind", ["history", "heritage", "archaeology", "local history"], ["museums", "philosophy"]),
  t("science", "science", "mind", ["science", "physics", "biology", "popular science"], ["astronomy", "coding"]),
  t("podcasts", "podcasts", "mind", ["podcast", "podcasts"], ["reading", "film"]),
  t("volunteering", "volunteering", "community", ["volunteer", "volunteering", "food bank", "community garden", "charity"], ["sustainability"]),
  t("sustainability", "sustainability", "community", ["sustainability", "climate", "repair café", "repair cafe", "zero waste", "rewilding"], ["volunteering", "gardening"]),
  t("coding", "coding", "work", ["coding", "programming", "software", "python", "web development", "side project"], ["design", "startups", "science"], ["design"]),
  t("design", "design", "work", ["graphic design", "ux design", "product design", "typography", "branding"], ["coding", "painting"], ["coding", "writing"]),
  t("startups", "starting something", "work", ["startup", "start-up", "small business", "freelance", "side hustle", "co-founder"], ["coding", "design"]),
  t("travel", "travel", "life", ["travel", "travelling", "backpacking", "interrail", "city break"], ["languages", "photography"]),
  t("dogs", "dogs", "life", ["dog", "dogs", "dog walk", "puppy"], ["hiking"]),
  stage("new-in-town", "new to the area", "You're both new to the area", ["new in town", "just moved", "recently moved", "new to the city", "new to the area", "moved here", "don't know many people", "don't know anyone"]),
  stage("parenting", "parent of young children", "You're both parents of young children", ["parenting", "new parent", "new mum", "new dad", "toddler", "school run", "my kids", "my daughter", "my son", "became a parent", "maternity leave", "paternity leave"]),
  stage("empty-nest", "children recently left home", "Your children have both recently flown the nest", ["empty nest", "kids have left home", "children have left home", "kids left home"], ["parenting"]),
  stage("retirement", "recently retired", "You've both recently retired", ["retired", "retirement", "just retired", "recently retired"]),
  stage("career-change", "changing career", "You're both changing career", ["career change", "changed career", "changing career", "retraining", "new career"]),
  stage("studying", "studying", "You're both studying", ["student", "studying", "at university", "at uni", "mature student", "doing a degree", "masters", "phd"]),
  stage("remote-work", "working from home", "You both work from home", ["work from home", "working from home", "wfh", "remote work", "work remotely"]),
];

/** Topics offered as interests (life stages are chosen separately). */
export const INTEREST_TOPICS = TOPIC_LIST.filter((x) => !x.stage);
export const LIFE_STAGES = TOPIC_LIST.filter((x) => x.stage);

export const TOPICS: Record<string, Topic> = Object.fromEntries(TOPIC_LIST.map((x) => [x.id, x]));

export const topicLabel = (id: string) => TOPICS[id]?.label ?? id.replace(/^p:/, "");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = TOPIC_LIST.map((topic) => ({
  id: topic.id,
  re: new RegExp(`(^|[^a-z])(${[topic.label, ...topic.keywords].map(escapeRe).join("|")})(s|ing)?([^a-z]|$)`, "i"),
}));

/** Finds taxonomy topics mentioned in free text (keyword based, local only). */
export function extractTopics(text: string): string[] {
  const lower = text.toLowerCase();
  return MATCHERS.filter((m) => m.re.test(lower)).map((m) => m.id);
}
