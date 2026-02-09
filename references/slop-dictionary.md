# AI Slop Dictionary

This is the definitive list of patterns that mark text as AI-generated.
Every pattern here is BANNED from output. No exceptions.

## Banned Punctuation

| Pattern | Replacement |
|---|---|
| Em dash (---) anywhere | Comma, period, colon, semicolon, or parentheses |
| Ellipsis (...) for dramatic effect | Period or restructure sentence |
| Excessive exclamation marks | Period |

## Banned Words

These words are statistically overrepresented in LLM output compared
to human writing. Do not use them.

### Transitional Filler
delve, moreover, furthermore, additionally, notably, importantly,
interestingly, significantly, fundamentally, essentially, ultimately,
consequently, subsequently, nevertheless, nonetheless, notwithstanding,
henceforth, thereby, wherein, thereof, hereby

### Inflated Adjectives
comprehensive, robust, cutting-edge, game-changing, groundbreaking,
innovative, transformative, revolutionary, paradigm-shifting,
state-of-the-art, world-class, best-in-class, holistic, synergistic,
dynamic, pivotal, crucial, vital, essential, indispensable, unparalleled,
unprecedented, remarkable

### Hedging Stack Words (ban clustered use)
potentially, arguably, perhaps, seemingly, apparently, ostensibly,
purportedly, conceivably, possibly, presumably, plausibly

### Corporate/Marketing Speak
leverage (as verb), synergy, optimize, streamline, facilitate,
implement, utilize (use "use"), ecosystem, landscape, space (as in
"the AI space"), stakeholder, value proposition, north star, deep dive,
double down, move the needle, low-hanging fruit, at the end of the day,
circle back, touch base, take it offline

### Sycophantic Filler
great question, that's a really important point, absolutely,
you're absolutely right, I'd be happy to, certainly, of course,
let me help you with that

## Banned Sentence Openers

Do not start any sentence with these phrases:
- "It's worth noting that..."
- "It's important to note that..."
- "In today's [anything] landscape..."
- "In an era of..."
- "In the ever-evolving world of..."
- "When it comes to..."
- "At its core..."
- "The reality is..."
- "The truth is..."
- "Make no mistake..."
- "Let's be clear..."
- "Here's the thing..."
- "The bottom line is..."
- "What's more..."
- "To put it simply..."
- "Simply put..."
- "In a nutshell..."
- "Long story short..."
- "As we all know..."
- "There's no denying that..."

## Banned Structural Patterns

### The Triple Pattern
Three-item lists in the form "X, Y, and Z" appearing more than twice
in any piece. Vary your list lengths (2 items, 4 items, no list at all).

### The Recap Paragraph
A paragraph at the end of a section that restates what the section just
said. Cut it. The reader just read it.

### The Universal Opener
Starting a piece with a sweeping statement about the world:
"In today's fast-paced digital world..." or "Technology has transformed
the way we..." or "The [industry] is experiencing unprecedented change."
Start with a specific fact, anecdote, question, or claim instead.

### The Uniform Paragraph
All paragraphs following the pattern: topic sentence, supporting detail,
supporting detail, wrap-up sentence. Real writing has one-sentence
paragraphs, three-sentence paragraphs, and six-sentence paragraphs.
Mix them.

### Hyper-Symmetry
Sentences and paragraphs of nearly identical length throughout the piece.
Human writing has natural rhythm variation: short punchy sentences
followed by longer, more complex ones.

### The Safety Hedge
Qualifying every claim with "may," "could," "might," "potentially."
Take a position when the evidence supports one.

## Banned Closing Patterns

- "In conclusion..."
- "To sum up..."
- "All in all..."
- "At the end of the day..."
- "Moving forward..."
- "The future looks bright..."
- Any sentence that begins "By [gerund]..." as a call-to-action
  (e.g., "By embracing these strategies, you can...")
- Restating the thesis word-for-word from the introduction

## Meta-Rule

If you read your output aloud and it sounds like a LinkedIn post,
a corporate blog, or a ChatGPT response, rewrite it.
