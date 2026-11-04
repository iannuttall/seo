import { ALL, type Context, PROSE, type RuleInfo } from './engine.js'
import { sentenceAt } from './text.js'
import type { BlockKind, LintLevel } from './types.js'

// Fixed phrases: one match is enough. Many patterns are adapted from MIT and
// Apache-2.0 sources: conorbronsdon/avoid-ai-writing (detector/patterns.js),
// eric-tramel/slop-guard, tbhb/vale-ai-tells, hardikpandya/stop-slop,
// coreyhaines31/marketingskills and simonw/tools (LLM cliche highlighter).
// Matching runs on text with straight quotes.

type Match = { text: string; sentence: string }

export type PhraseRule = RuleInfo & {
  kinds?: BlockKind[]
  patterns: RegExp[]
  message: string | ((match: Match) => string)
  fix: string | ((match: Match) => string)
  // A per-match level, such as a weaker form of the same pattern.
  levelFor?: (match: Match) => LintLevel | undefined
  skip?: (match: Match) => boolean
}

const cut = (match: Match) =>
  `Cut "${match.text.trim()}" and start with the point itself.`

// Plain words for common AI vocabulary. Adapted from avoid-ai-writing's
// tier lists (MIT).
const PLAIN: Record<string, string> = {
  delve: 'look at, dig into',
  tapestry: 'mix, range',
  testament: 'shows, proves',
  underscore: 'shows',
  showcase: 'show',
  meticulous: 'careful, thorough',
  intricate: 'complex, detailed',
  intricacies: 'details',
  garner: 'get, win',
  commendable: 'good',
  realm: 'area, field',
  interplay: 'link, relationship',
  multifaceted: 'varied, with several parts',
  groundbreaking: 'new, first',
  beacon: 'example',
  paramount: 'most important',
  embark: 'start',
  bolster: 'strengthen, support',
  'ever-evolving': 'changing',
  'ever-changing': 'changing',
  nestled: 'is in, sits in',
  bustling: 'busy',
  synergy: 'working together',
  revolutionize: 'change',
  'navigate the complexities': 'deal with, work through',
  supercharge: 'speed up, improve (say by how much)',
  turbocharge: 'speed up (say by how much)',
  'next-level': 'better (say how)',
  'world-class': 'say what makes it good',
  'best-in-class': 'say what it beats and how',
  'state-of-the-art': 'new, current (say what it does)',
  'cutting-edge': 'new, latest',
  revolutionary: 'new (say what changed)',
  innovative: 'new (say what is new)',
  'industry-leading': 'name the measure and the lead',
  'blazing-fast': 'give the time',
  effortless: 'say how many steps it takes',
  bespoke: 'custom, made for you',
  'mission-critical': 'essential',
  'enterprise-grade': 'say which security or scale it meets',
  'battle-tested': 'say where it has run',
  bulletproof: 'reliable (say how)',
  unparalleled: 'name what it beats',
  unmatched: 'name what it beats',
  leverage: 'use',
  unlock: 'get, open, allow',
  seamless: 'smooth, simple (or say what does not break)',
  robust: 'reliable, strong (or say what it survives)',
  holistic: 'whole, complete',
  utilize: 'use',
}

function plainFor(word: string): string {
  const lower = word.toLowerCase()
  for (const [key, value] of Object.entries(PLAIN)) {
    if (lower.startsWith(key.slice(0, Math.max(4, key.length - 2)))) {
      return value
    }
  }
  return 'a plain word'
}

export const PHRASE_RULES: PhraseRule[] = [
  {
    id: 'chatbot-residue',
    family: 'ai',
    level: 'error',
    description:
      'Text an assistant leaves behind: "I hope this helps", "as an AI model", [Your Name] placeholders, citation tokens.',
    patterns: [
      /\bI hope (?:this|that) helps\b/gi,
      /(?:^|[.!?]\s)(?:Certainly|Absolutely|Of course|Great question)!/g,
      /\b(?:great|excellent) question\b/gi,
      /\byou're absolutely right\b/gi,
      /\bwould you like me to\b/gi,
      /\blet me know if you(?:'d like| need| want| have any)\b/gi,
      /\bfeel free to (?:reach out|ask|contact)\b/gi,
      /\bhere(?:'s| is) (?:a|an|the|your) (?:revised|updated|rewritten|polished|improved|refined) (?:version|draft|copy)\b/gi,
      /\bas an? (?:AI|artificial intelligence|large language)(?: language)? model\b/gi,
      /\bas of my (?:last|latest|knowledge) (?:update|training|cut-?off)\b/gi,
      /\bI (?:don't|do not) have access to real-time\b/gi,
      /\[(?:Your|Insert|Add|Enter|Describe|Company|Product|Client|Customer|Author|Brand)\b[^\]\n]{0,60}\]/g,
      /\[(?:INSERT|TODO|TBD|PLACEHOLDER|FILL IN)\b[^\]\n]{0,60}\]/g,
      /\bcite(?:turn|news|search)\d+\w*\b/gi,
      /\bcontentReference\b|\boai_citation\b/gi,
    ],
    message:
      'This reads as text left over from a chat assistant, not part of the page.',
    fix: (match) =>
      match.text.startsWith('[')
        ? 'Fill in the placeholder with the real name, number or source.'
        : 'Delete it.',
  },
  {
    id: 'not-because',
    family: 'ai',
    level: 'error',
    description: '"Not because X. Because Y." contrast.',
    patterns: [
      /\bnot because\b[^.!?]{3,80}[.!?;,]\s*(?:but\s+)?(?:[\w']+\s+){0,3}because\b/gi,
    ],
    message: 'A "not because X, because Y" setup delays the actual reason.',
    fix: 'Give the reason once: "X happened because Y."',
  },
  {
    id: 'negation-countdown',
    family: 'ai',
    level: 'error',
    description:
      '"Not X. Not Y. Just Z." countdowns and "No X, no Y, no Z" chains.',
    patterns: [
      /(?:^|[.!?:]\s+)Not [^.!?]{1,40}[.,]\s+Not [^.!?]{1,40}[.,;]\s*(?:Just |But |Only )?[A-Za-z]/g,
      /(?:^|[.!?:]\s)No (?!matter\b|one\b|doubt\b|longer\b|way\b|less\b|more\b)[a-z'-]+(?: [a-z'-]+)?(?:\s*,\s*(?:and |or |just )?no (?!matter\b|one\b|doubt\b|longer\b|way\b)[a-z'-]+(?: [a-z'-]+)?){2,}/g,
    ],
    message:
      'A run of "not" or "no" items builds drama instead of saying what it is.',
    fix: 'Say what it is in one plain sentence, and keep only a negation the reader needs.',
  },
  {
    id: 'self-answered-question',
    family: 'ai',
    level: 'error',
    description:
      'A label question answered at once ("The result? ..."), and stock questions such as "Sound familiar?".',
    patterns: [
      /\b(?:The|And the|But the|So the)\s+(?:result|outcome|answer|catch|kicker|problem|reason|reality|truth|best part|worst part|irony|twist|takeaway|upshot|downside|upside|difference|secret|verdict|fix|solution|bottom line)\?\s+["(]?[A-Z0-9]/g,
      /\b(?:sound familiar|what's next|so why should you care|why does this matter|the best part)\?/gi,
      /\bbut what does (?:this|that|it) (?:mean|look like) for\b/gi,
    ],
    message:
      'A question the writer answers straight away. It slows the reader down.',
    fix: 'State the answer as a plain sentence and drop the question.',
  },
  {
    id: 'throat-clearing',
    family: 'ai',
    level: 'error',
    description:
      'Openers that announce a point instead of making it: "Here\'s the thing", "The truth is", "Let that sink in".',
    patterns: [
      /\bhere's the (?:thing|deal|kicker|catch|twist|truth|secret|reality)\b/gi,
      // After "what", "how" or "whether" the phrase is a clause ("ask what
      // the thing is"), not an opener.
      /(?<!\b(?:what|how|whatever|whether|where|why|who|if)\s)\b(?:the (?:uncomfortable |honest |hard |brutal |simple |real )?truth is|the reality is(?: that)?|the thing is|the honest answer(?: is)?)\b/gi,
      /\b(?:let me be (?:clear|honest|blunt)|let's be (?:clear|honest|real)|real talk|make no mistake|let that sink in|read that again)\b/gi,
      /\bfull stop\.\s*$/gim,
    ],
    message: 'This announces a point instead of making it.',
    fix: cut,
  },
  {
    id: 'faux-insight',
    family: 'ai',
    level: 'error',
    description:
      'Claims of hidden knowledge: "what nobody tells you", "the part most people miss", "This is the finding that only shows up...".',
    patterns: [
      /\bwhat (?:nobody|no one|most people) (?:tells? you|gets? wrong|misses|realizes?|realises?|talks? about|knows?)\b/gi,
      /\bthe (?:part|thing|bit) (?:everyone|most people|nobody|no one) (?:miss(?:es)?|skips?|gets? wrong|ignores?|forgets?|overlooks?)\b/gi,
      /\bthis is the (?:part|finding|insight|bit|thing|lesson|piece) (?:that )?(?:only|most|nobody|no one|everyone|I didn't|I did not|you won't)\b/gi,
      /\bthe (?:dirty|open|best-kept|little-known) secret\b/gi,
      /\b(?:a problem nobody talks about|the insight everyone's missing|most people don't reali[sz]e)\b/gi,
    ],
    message: 'It claims a hidden insight instead of showing the finding.',
    fix: 'Lead with the finding itself and the number behind it.',
  },
  {
    id: 'significance-inflation',
    family: 'ai',
    level: 'error',
    description:
      'Importance puffery: "plays a crucial role", "marks a pivotal moment", "a testament to".',
    patterns: [
      /\bplays? an? (?:crucial|pivotal|vital|key|significant|critical|central|important|major) role\b/gi,
      /\b(?:marks?|marking|represents?|signals?) an? (?:pivotal|significant|important|major|defining|watershed|key) (?:moment|shift|turning point|milestone|step)\b/gi,
      /\b(?:stands?|serves?) as an? (?:testament|reminder|beacon)\b/gi,
      /\ba testament to\b/gi,
      /\b(?:left|leaves) an indelible mark\b/gi,
      /\bsetting the stage for\b/gi,
      /\breflects? (?:a )?broader\b/gi,
      /\bdeeply rooted\b/gi,
      /\ban? (?:meaningful|significant|major|big|bold|giant|monumental|crucial|pivotal|huge) step (?:towards?|forward)\b/gi,
      /\bwatershed moment\b/gi,
      /\bhas emerged as (?:a|the|one of) (?:leading|key|major|critical|essential|pivotal|prominent|dominant)\b/gi,
      /\bextends? far beyond\b/gi,
    ],
    message: 'It inflates importance without saying what changed.',
    fix: 'Name the concrete effect: what changed, for whom, and by how much.',
  },
  {
    id: 'participle-tail',
    family: 'ai',
    level: 'error',
    description:
      'A sentence that ends on ", highlighting/underscoring/showcasing ..." commentary.',
    kinds: PROSE,
    patterns: [
      /,\s+(?:highlighting|underscoring|emphasi[sz]ing|showcasing|symboli[sz]ing|solidifying|cementing|signall?ing|reinforcing|fostering|cultivating|paving the way|setting the stage|demonstrating|illustrating|reflecting|ensuring|marking|contributing to)\b[^.!?]{0,120}[.!?]?/gi,
    ],
    levelFor: (match) =>
      /^,\s+(?:reflecting|ensuring|marking|contributing|demonstrating|illustrating)/i.test(
        match.text,
      )
        ? 'warning'
        : undefined,
    message:
      'The ", highlighting ..." tail comments on the sentence instead of adding a fact.',
    fix: 'End the sentence at the comma. If the tail holds a real fact, give it its own sentence with a subject and verb.',
  },
  {
    id: 'ai-vocabulary',
    family: 'ai',
    level: 'error',
    description:
      'Words far more common in AI text than in human writing: delve, tapestry, testament, showcase, meticulous, realm.',
    patterns: [
      /\bdelv(?:e|es|ed|ing)\b/gi,
      /\b(?:rich )?tapestry\b/gi,
      /\bunderscor(?:e|es|ed|ing)\s+(?:the|that|how|its|their|a|an|why|what|this|our|his|her)\b/gi,
      /\bshowcas(?:es|ed|ing)\b|\b(?:to|will|can|we|they|you|and|helps?) showcase\b|\bshowcase (?:how|the|our|your|their|its|what|why|a|an)\b/gi,
      /\bmeticulous(?:ly)?\b/gi,
      /\bintricate(?:ly)?\b|\bintricacies\b/gi,
      /\bgarner(?:s|ed|ing)?\b/gi,
      /\bcommendable\b/gi,
      /\brealms?\b/gi,
      /\binterplay\b/gi,
      /\bmultifaceted\b/gi,
      /\bgroundbreaking\b/gi,
      /\ba beacon of\b/gi,
      /\bparamount\b/gi,
      /\bembark(?:s|ed|ing)?\b/gi,
      /\bbolster(?:s|ed|ing)?\b/gi,
      /\bever-(?:evolving|changing)\b/gi,
      /\bnestled\b/gi,
      /\bbustling\b/gi,
      /\bsynerg(?:y|ies)\b/gi,
      /\brevolutioni[sz](?:e|es|ed|ing)\b/gi,
      /\bnavigat(?:e|ing) the complexit(?:y|ies)\b/gi,
    ],
    message: (match) =>
      `"${match.text}" is far more common in AI text than in human writing.`,
    fix: (match) => `Use ${plainFor(match.text.replace(/^(?:rich|a) /i, ''))}.`,
  },
  {
    id: 'banned-word',
    family: 'copy',
    level: 'error',
    description:
      'Words the house style bans when a plain word works: leverage, unlock, seamless, robust, holistic, utilize, "source of truth".',
    patterns: [
      /\bleverag(?:e|es|ed|ing)\b/gi,
      /\bunlock(?:s|ed|ing)?\b/gi,
      /\bseamless(?:ly)?\b/gi,
      /\brobust(?:ly|ness)?\b/gi,
      /\bholistic(?:ally)?\b/gi,
      /\butili[sz](?:e|es|ed|ing|ation)\b/gi,
      /\bsource of truth\b/gi,
      /\bwithout the hype\b/gi,
      /\beverything you need(?: to know)?\b/gi,
      /\bgets? you to the next fix\b/gi,
    ],
    message: (match) => `"${match.text}" is on the house list of words to cut.`,
    fix: (match) =>
      /source of truth/i.test(match.text)
        ? 'Name the actual file, field or result.'
        : /hype|everything you need|next fix/i.test(match.text)
          ? 'Say what the page or tool actually gives the reader.'
          : `Use ${plainFor(match.text)}.`,
  },
  {
    id: 'buzzword',
    family: 'copy',
    level: 'warning',
    presets: { landing: 'error', meta: 'error' },
    description:
      'Marketing adjectives that make claims without proof: world-class, cutting-edge, next-level, effortless.',
    patterns: [
      /\b(?:supercharg|turbocharg)(?:e|es|ed|ing)\b/gi,
      /\bnext-level\b|\bworld-class\b|\bbest-in-class\b|\bstate-of-the-art\b|\bcutting-edge\b/gi,
      /\brevolutionary\b|\binnovative\b|\bindustry-leading\b|\bblazing(?:ly)?[- ]fast\b/gi,
      /\beffortless(?:ly)?\b|\bbespoke\b|\bmission-critical\b|\benterprise-grade\b/gi,
      /\bbattle-tested\b|\bbulletproof\b|\bunparalleled\b|\bunmatched\b/gi,
    ],
    message: (match) => `"${match.text}" claims quality without showing it.`,
    fix: (match) => `Replace it with the proof: ${plainFor(match.text)}.`,
  },
  {
    id: 'cliche',
    family: 'ai',
    level: 'error',
    description:
      'Stock idioms that fit any company: "would kill for", "move the needle", "low-hanging fruit", "isn\'t the whole story".',
    patterns: [
      /\b(?:would|will|'d) kill for\b/gi,
      /\blow-hanging fruit\b/gi,
      /\b(?:move|moves|moved|moving) the needle\b/gi,
      /\bdouble-edged sword\b/gi,
      /\b(?:the )?elephant in the room\b/gi,
      /\bat the end of the day\b/gi,
      /\bgame[- ]chang(?:er|ers|ing)\b/gi,
      /\bparadigm shift\b/gi,
      /\bsecret sauce\b/gi,
      /\blevel up\b/gi,
      /\btake (?:it|things|this|that|your \w+) to the next level\b/gi,
      /\b(?:a )?deep dive\b/gi,
      /\blet's dive in(?:to)?\b/gi,
      /\bbuckle up\b|\blook no further\b|\bwithout further ado\b/gi,
      /\bthe heart of the matter\b|\bthe bottom line is\b|\bat its core\b/gi,
      /\b(?:isn't|is not|wasn't|was not) the whole story\b|\bonly half the story\b|\btip of the iceberg\b/gi,
      /\bworth its weight in gold\b|\ba no-brainer\b|\bthe best of both worlds\b/gi,
      /\bthink outside the box\b|\bhit the ground running\b|\bon steroids\b/gi,
      /\b(?:a|the) perfect storm\b|\bthe new normal\b|\bin a nutshell\b/gi,
      /\bstrikes? a chord\b|\bstruck gold\b/gi,
      /\bearns? (?:its|their) (?:keep|place|spot|stripes)\b/gi,
      /\b(?:does|do|doing) the heavy lifting\b|\bpulls? (?:its|their) weight\b/gi,
      /\b(?:slipped|slips|fell|falls|falling) through the cracks\b/gi,
      /\bpaves? the way\b/gi,
      /\bnorth star\b|\btable stakes\b|\bneedle in a haystack\b/gi,
      /\bnot a rounding error\b/gi,
      /\bthe (?:whole|entire) point\b/gi,
      /,? which is (?:the (?:whole |real |entire )?point|exactly the point|kind of the point)\b/gi,
    ],
    message: (match) =>
      `"${match.text}" is a stock phrase that would fit any page.`,
    fix: 'Say the specific thing in literal words, with the number or name that makes it true here.',
  },
  {
    id: 'filler',
    family: 'ai',
    level: 'error',
    description:
      'Phrases that delay the point: "it\'s worth noting", "it is important to note", "needless to say".',
    patterns: [
      /\bit(?:'s| is) (?:worth|important to) (?:noting|note|mentioning|mention|remembering|pointing out)(?: that)?\b/gi,
      /\bit should be noted(?: that)?\b/gi,
      /\bit is (?:essential|crucial|important|vital) to (?:note|remember|understand|recogni[sz]e)(?: that)?\b/gi,
      /\bneedless to say\b|\bit goes without saying\b/gi,
      /\bas (?:mentioned|noted|discussed|stated) (?:earlier|above|previously|before)\b/gi,
      /\bin this (?:article|post|guide|blog post),? (?:we|I)(?:'ll| will)\b/gi,
      /\blet me walk you through\b/gi,
      /\bthe rest of this (?:post|article|essay|guide) (?:explains|covers|looks at)\b/gi,
      /\bwhen it comes to\b/gi,
    ],
    levelFor: (match) =>
      /when it comes to/i.test(match.text) ? 'warning' : undefined,
    message: 'Filler that delays the point.',
    fix: cut,
  },
  {
    id: 'stock-opener',
    family: 'ai',
    level: 'error',
    description:
      'Scene-setting openers: "In today\'s fast-paced world", "Imagine a world where", "Whether you\'re a X or a Y".',
    patterns: [
      /\bin today's (?:[\w-]+ ){0,2}(?:world|landscape|age|era|market|economy|climate)\b/gi,
      /\bin an era (?:where|of|when)\b/gi,
      /\bin the (?:rapidly |ever-)?(?:evolving|changing|shifting) (?:world|landscape|realm|space) of\b/gi,
      /\b(?:imagine|picture|envision)(?:\s*,[^,\n]{1,30},)? a (?:world|future|reality) (?:where|in which)\b/gi,
      /\bwhether you're (?:a|an) [^.!?,]{1,30} or (?:a|an|just|simply)\b/gi,
      /\bsay goodbye to\b|\bsay hello to\b/gi,
      /(?:^|[.!?]\s)Meet [A-Z][\w'-]{1,29}\s*,\s*(?:your new|the new)\b/g,
      /(?:^|[.!?]\s)Think [A-Z][\w'-]{1,29} meets [A-Z][\w'-]{1,29}\b/g,
      /\b(?:let's face it|picture this|ever wondered)\b/gi,
    ],
    message: 'A generic opener that could start any article.',
    fix: 'Open with the specific problem, number or result this page is about.',
  },
  {
    id: 'generic-closer',
    family: 'ai',
    level: 'error',
    description:
      'Tidy endings: "In conclusion", "the future looks bright", "only time will tell".',
    patterns: [
      /\bthe future (?:of \w+ )?(?:looks bright|is here|is now|starts now|is bright)\b/gi,
      /\bonly time will tell\b|\bone thing is (?:certain|clear)\b/gi,
      /\bexciting times (?:lie )?ahead\b|\bas we move forward\b/gi,
      /(?:^|[.!?]\s)(?:In conclusion|In summary|To sum (?:it )?up|To summari[sz]e|All in all|In closing)\b/gi,
      /\bthe possibilities are endless\b|\bthe rest is history\b/gi,
      /\bbecause (?:you|your team) deserves? (?:better|more|the best)\b/gi,
    ],
    message: 'A stock closing line that adds nothing the page has not said.',
    fix: 'End on the next step, or on the last concrete fact.',
  },
  {
    id: 'narrative-pivot',
    family: 'ai',
    level: 'error',
    description:
      'Staged turns: "something shifted", "this is where it gets interesting", "that changes everything".',
    patterns: [
      /\b(?:something shifted|everything changed|(?:and )?that changes everything|that changed everything)\b/gi,
      /\bthat's when (?:everything|it all) changed\b/gi,
      /\b(?:then )?something (?:interesting|unexpected) happened\b/gi,
      /\b(?:this|here) is where (?:things|it) gets? (?:interesting|tricky|fun)\b|\bhere's where it gets (?:interesting|tricky)\b/gi,
      /\bflipped the script\b|\brewrote the playbook\b|\bchanged the game\b|\bplot twist\b/gi,
    ],
    message: 'A staged turn that tells the reader to feel surprised.',
    fix: 'Say what happened and let the fact carry the surprise.',
  },
  {
    id: 'performed-insight',
    family: 'ai',
    level: 'error',
    description:
      'Profundity on display: "that\'s not nothing", "sit with that", "don\'t take my word for it", "the only X that matters".',
    patterns: [
      /\b(?:that|this|it|which)(?:'s| is| was) not nothing\b/gi,
      /\bsit(?:s|ting)? with (?:that|this)(?=\s*(?:[.!?,;:)]|$|for a))/gi,
      /\b(?:do not|don't) (?:have to )?take my word for it\b/gi,
      /\byou already know the answer\b/gi,
      /\bthe only [\w'-]+ that (?:matters|counts)\b/gi,
      /\b(?:that|this)(?:'s| is| was) the part (?:that|nobody|no one|most people)\b/gi,
      /\bthe (?:line|quote|bit|idea|point) (?:that )?I keep coming back to\b/gi,
      /\bI can't stop thinking about\b/gi,
      /(?:^|[.!?]\s)Turns out\b/g,
    ],
    levelFor: (match) => (/Turns out/.test(match.text) ? 'warning' : undefined),
    message: 'It performs insight instead of stating it.',
    fix: 'State the fact plainly and let the reader decide how deep it is.',
  },
  {
    id: 'vague-attribution',
    family: 'ai',
    level: 'error',
    description:
      'Unnamed sources: "experts agree", "studies show", "research suggests".',
    patterns: [
      /\b(?:experts?|analysts|industry leaders|many people|some people|critics) (?:agree|say|believe|suggest|argue|recommend)\b/gi,
      /\b(?:studies|research|surveys) (?:show|shows|suggest|suggests|indicate|indicates|proves?)\b/gi,
      /\bit is (?:widely|generally|commonly) (?:believed|accepted|known|agreed)\b/gi,
    ],
    message: 'A claim credited to nobody in particular.',
    fix: 'Name the source and link it, or cut the claim.',
  },
  {
    id: 'hedge-stack',
    family: 'ai',
    level: 'error',
    description: 'Stacked hedges: "could potentially", "may possibly".',
    patterns: [
      /\b(?:could|may|might)\s+(?:(?!not\b|never\b|hardly\b|barely\b)\w+\s+)?(?:potentially|possibly|conceivably|perhaps)\b/gi,
      /\b(?:potentially|possibly)\s+(?:could|may|might)\b/gi,
    ],
    message: 'Two hedges where one, or none, would do.',
    fix: 'Keep one qualifier, or state what the evidence shows.',
  },
  {
    id: 'colon-reveal',
    family: 'ai',
    level: 'error',
    kinds: PROSE,
    description:
      'A label and colon used as a drumroll: "The best part: it learns."',
    patterns: [
      /(?:^|[.!?]\s+)(?:The|One|My|Here's the|And the|But the)\s+(?:\w+\s+){0,3}(?:part|thing|secret|trick|catch|kicker|truth|twist|takeaway|lesson|upshot|irony|punchline):\s+\S/g,
    ],
    message: 'A colon reveal builds suspense the content does not need.',
    fix: 'Say it straight: drop the label and keep what follows the colon.',
  },
  {
    id: 'copula-avoidance',
    family: 'ai',
    level: 'error',
    description:
      '"Serves as", "stands as", "boasts" where "is" or "has" would do.',
    patterns: [
      /\bstands? as (?:a|an|the)\b/gi,
      /\bboasts? (?:a|an|the|over|more|\d)/gi,
      /\bholds? the distinction of\b/gi,
      /\bserves? as (?:a|an|the)\b/gi,
    ],
    levelFor: (match) => (/^serves?/i.test(match.text) ? 'warning' : undefined),
    message: (match) => `"${match.text.trim()}" dodges a plain "is" or "has".`,
    fix: 'Use "is" or "has".',
  },
  {
    id: 'marketing-phrase',
    family: 'copy',
    level: 'error',
    description:
      'Stock landing-page phrases: "unlock the power of", "X, reimagined", "in just a few clicks", "join thousands of".',
    patterns: [
      /\bthe power of\b/gi,
      /\b\w+, (?:reimagined|redefined|reinvented)\b/gi,
      /\btransform(?:s)? the way (?:you|teams|people)\b/gi,
      /\bthe \w+ you(?:'ve| have)? (?:deserve|been waiting for)\b/gi,
      /\ball-in-one\b/gi,
      /\bin (?:just )?a few (?:clicks|minutes|seconds)\b/gi,
      /\bjoin (?:thousands|millions|hundreds) of (?:happy|satisfied|other)?\b/gi,
      /\bin seconds,? not (?:hours|days|weeks)\b/gi,
      /\bmore than just an?\b/gi,
      /\bthat's where \w+ comes? in\b/gi,
      /\btrusted by (?:industry leaders|thousands|teams worldwide|the best)\b/gi,
      /\bbuilt for teams (?:who|that) move fast\b/gi,
    ],
    levelFor: (match) =>
      /the power of/i.test(match.text) ? 'warning' : undefined,
    message: (match) =>
      `"${match.text}" is a stock landing-page line that fits any product.`,
    fix: 'Say what the product does for this reader, with a number or an example.',
  },
  {
    id: 'stranded-negation',
    family: 'ai',
    level: 'error',
    kinds: PROSE,
    description:
      'A one-line denial used as a beat: "It isn\'t." "Not quite." "But only part."',
    patterns: [
      /(?:^|[.!?:]\s+)(?:It|That|This|They|He|She|We) (?:isn't|wasn't|doesn't|didn't|won't|aren't|weren't|is not|was not|does not|did not)\.(?=\s|$)/g,
      /(?:^|[.!?:]\s+)(?:Not quite|Not even close|Not really|Not anymore|Not any more)\.(?=\s|$)/g,
      /(?:^|[.!?:]\s+)(?:But|And) only (?:part|half|some|partly)\.(?=\s|$)/g,
    ],
    message: 'A two-word denial used for rhythm. It makes the reader wait.',
    fix: 'Join it to the sentence before, such as "Nothing technical was holding these pages back."',
  },
]

// A phrase in quotes is mentioned, not used: 'link text such as "click
// here"' is fine.
export function quoted(text: string, start: number, end: number): boolean {
  return (
    (text[start - 1] === '"' || text[start - 1] === "'") &&
    /^[.,;:!?]?["']/.test(text.slice(end, end + 2))
  )
}

export function runPhraseRules(ctx: Context) {
  for (const rule of PHRASE_RULES) {
    if (ctx.level(rule) === 'off') continue
    for (const block of ctx.blocks(rule.kinds ?? ALL)) {
      const sentences = ctx.sentences(block)
      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0
        for (const found of block.norm.matchAll(pattern)) {
          let start = found.index ?? 0
          let end = start + found[0].length
          // Leading separators belong to the pattern, not the excerpt.
          while (start < end && /[\s.!?:,]/.test(block.norm[start] ?? '')) {
            if (block.norm[start] === ',' && rule.id === 'participle-tail') {
              break
            }
            start++
          }
          while (end > start && /\s/.test(block.norm[end - 1] ?? '')) end--
          const sentence = sentenceAt(sentences, start)
          const match = {
            text: block.text.slice(start, end),
            sentence: sentence.text,
          }
          if (rule.skip?.(match) || quoted(block.norm, start, end)) continue
          if (
            rule.id === 'vague-attribution' &&
            block.links.some(
              (link) => link.start < sentence.end && link.end > sentence.start,
            )
          ) {
            continue
          }
          ctx.hit(
            rule,
            block,
            start,
            end,
            typeof rule.message === 'function'
              ? rule.message(match)
              : rule.message,
            typeof rule.fix === 'function' ? rule.fix(match) : rule.fix,
            rule.levelFor?.(match),
          )
        }
      }
    }
  }
}
