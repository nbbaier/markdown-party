# Collaborative Markdown Editors in the Agent Era

## Executive summary

There has been a noticeable cluster of products launched or repositioned around the idea of **“Google Docs for Markdown”**, especially as agents have made Markdown more useful as a shared working format.

The category is shifting from:

> humans collaboratively editing Markdown

to:

> humans and software agents operating on the same durable documents

That creates a somewhat different product category, with new requirements around authorship, permissions, provenance, filesystem interoperability, and machine access.

The space currently breaks into four groups:

| Category | Representative products | Main value proposition |
|---|---|---|
| Established collaborative Markdown | HackMD, HedgeDoc | Real-time editing for technical teams |
| Lightweight document sharing | Mist | A Markdown file with Google Docs-style collaboration |
| Agent-first multiplayer editors | Composer, Proof | Humans and agents edit the same document as peers |
| Local/file-first agent editors | Ritemark, MarkMorph, Shared Context | Agents work directly against Markdown files on your computer |

The strongest current contenders appear to be:

- **HackMD**, as the mature commercial incumbent that is rapidly repositioning itself for agents.
- **Composer**, as the clearest pure-play “multiplayer Markdown for humans and agents.”
- **Proof**, which differentiates around agent attribution and document provenance.
- **Mist**, as a deliberately minimal, link-based, interoperable collaboration layer.
- **HedgeDoc**, as the major self-hosted open-source option.

The market is real but not yet settled. The products are still testing whether the durable business is:

1. a better collaborative editor,
2. an agent interface to files,
3. an approval and governance layer for agent output, or
4. a new kind of shared workspace protocol.

The third and fourth possibilities seem more defensible than “Markdown Google Docs” by itself.

---

## Why Markdown is becoming strategically important

Markdown already had strong adoption among developers, technical writers, researchers, and note-taking enthusiasts. Agents add several new advantages.

### 1. Markdown is inexpensive for models to consume

Cloudflare describes Markdown as a growing “lingua franca” for AI systems because it preserves semantic structure without the large markup overhead of HTML. In one example, Cloudflare reported that converting a web page from HTML to Markdown reduced its representation from 16,180 tokens to 3,150 tokens—about an 80% reduction.

Source: [Cloudflare — Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/)

That does not mean every document needs to be Markdown. It does mean Markdown is unusually well suited to repeated machine reading, retrieval, and rewriting.

### 2. Coding agents already treat Markdown as operational infrastructure

Agent workflows increasingly revolve around files such as:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- specifications and implementation plans
- issue descriptions
- research notes
- generated reports
- prompt and skill definitions

The documents are not just prose. They can act as instructions, memory, task state, and interfaces between agents.

Recent research is starting to formalize this file-based pattern. The Model Workspace Protocol describes workflows in which folder structure and Markdown files replace much of the orchestration normally implemented in agent frameworks.

Source: [arXiv — Model Workspace Protocol](https://arxiv.org/abs/2606.14445)

### 3. Existing collaboration systems are awkward for agents

Google Docs, Notion, and similar tools expose documents through proprietary internal models and APIs. Agents can interact with them, but the canonical object is not generally a normal file that can be:

- read with ordinary shell tools,
- changed with a patch,
- stored in Git,
- reviewed through a diff,
- opened locally,
- handed between different agent runtimes.

At the other extreme, plain Markdown files work well for agents but poorly for nontechnical collaborators. Comments, suggestions, sharing, presence, and permissions generally require GitHub or a separate workflow.

The emerging products are trying to bridge that divide.

---

# Product landscape

## 1. HackMD

**Position:** The established commercial incumbent.

HackMD has offered real-time collaborative Markdown for years. Its traditional use cases include shared technical notes, documentation, meetings, education, and community collaboration. It supports live editing, sharing, permissions, comments, version history, and integrations with GitHub and GitLab.

Sources:

- [HackMD homepage](https://homepage.hackmd.io/)
- [HackMD developer tools](https://hackmd.io/developers)

More recently, HackMD has repositioned itself around agent workflows. Its product now emphasizes:

- an MCP server,
- a CLI,
- an API,
- raw Markdown access,
- Git-based integrations,
- Markdown-oriented content delivery.

HackMD is therefore no longer merely an adjacent incumbent. It is directly pursuing the agent-collaboration category.

### Advantages

- Mature collaboration and permissions
- Existing user and enterprise base
- Hosted service with team workspaces
- API, CLI, Git integration, and MCP
- More complete than most new entrants

### Limitations

- The document remains primarily a hosted HackMD object rather than a local file.
- Its interface and product model predate agent-first collaboration.
- Agents can operate through tools, but may not feel like visible first-class document participants.
- A broad product can be slower to optimize for a narrow new workflow.

HackMD’s likely strategy is to absorb most of the category as features. New products therefore need a sharper wedge than simply “collaborative Markdown.”

---

## 2. Composer

**Position:** The clearest direct expression of “Google Docs for Markdown and agents.”

Composer calls itself a “multiplayer Markdown editor for you, your team, and your agents.” Its stated model is:

- humans edit together in real time,
- collaborators leave comments and suggestions,
- agents connect through MCP,
- agents join documents as collaborators,
- agent output appears directly in the shared document.

Source: [Composer](https://usecomposer.md/)

This is important conceptually. The agent is not merely invoked through an AI sidebar. It is represented as another participant acting against the shared artifact.

### Advantages

- Very clear product narrative
- First-class agent participation
- MCP-native integration
- Comments, suggestions, and real-time human collaboration
- Well aligned with coding-agent workflows

### Risks

- The core feature set is reproducible by a larger incumbent.
- Its value depends on whether teams want agents directly editing documents rather than editing repository files through Git.
- It may be difficult to distinguish at the editor layer alone.
- Public evidence of broad adoption or a developed commercial model is limited.

Composer looks like one of the most direct competitors to watch because it embodies the new category rather than merely adding AI generation to an existing editor.

---

## 3. Proof

**Position:** An agent-first document editor differentiated by provenance.

Proof describes itself as a collaborative editor where humans and AI write together. Its most distinctive feature is character-level authorship tracking: the interface visually indicates which portions were written by a human and which were written by an agent.

Source: [Proof](https://www.proofeditor.ai/)

Its collaboration model includes:

- agent and human editing,
- comments,
- suggestions,
- attribution,
- a lightweight link-based experience,
- no-login document access in some flows.

### Why provenance matters

As agents make larger contributions, the important question becomes less:

> Can an AI write in this editor?

and more:

> What changed, who changed it, what evidence was used, and who approved it?

Provenance may matter in:

- regulated documentation,
- legal drafting,
- policy documents,
- publishing,
- research,
- enterprise knowledge management,
- approvals involving multiple agents,
- internal accountability.

### Risks

- Character-level attribution may not be enough on its own; users may need prompt history, model identity, tool calls, and source citations.
- It may be perceived as a feature rather than a full platform.
- There is potential brand confusion with other companies called Proof.
- It still needs a compelling recurring workflow beyond viewing agent authorship.

Proof has one of the more defensible conceptual directions because governance and trust become more important as agent autonomy increases.

---

## 4. Mist

**Position:** Minimal, ephemeral, interoperable collaboration.

Mist was created by Matt Webb after he could not find a satisfactory tool offering:

- a pure Markdown editor,
- live cursors,
- comments,
- suggested edits,
- a URL-based sharing model,
- collaboration metadata that could travel with the document.

Sources:

- [Introducing Mist](https://interconnected.org/home/2026/02/12/mist)
- [Open-sourcing Mist](https://interconnected.org/home/2026/04/10/open-mist)

Mist is intentionally closer to “a collaborative layer for a file” than a complete team workspace. It was subsequently open-sourced under the MIT license, with an explicit interest in interoperability.

### Advantages

- Focused and comprehensible
- Low-friction sharing
- Open source
- Strong file-oriented philosophy
- Comments and suggested edits without a large workspace abstraction
- Potentially good for temporary collaboration with external participants

### Limitations

- Early-stage and explicitly a work in progress
- Likely lacks enterprise administration and workflow depth
- Ephemeral documents may limit knowledge-base use cases
- Minimalism makes monetization more difficult

Mist highlights a useful unmet need: users often do not want another permanent workspace. They want to take one Markdown file, collaborate briefly, and get the file back without conversion or lock-in.

---

## 5. HedgeDoc

**Position:** The leading established open-source, self-hosted collaborative Markdown editor.

HedgeDoc, formerly CodiMD, provides browser-based real-time Markdown editing, shared links, diagrams, and presentations. It is self-hostable and licensed under AGPL.

Sources:

- [HedgeDoc](https://hedoc.org/)
- [HedgeDoc GitHub repository](https://github.com/hedgedoc/hedgedoc)
- [Commenting feature discussion](https://github.com/hedgedoc/hedgedoc/issues/657)

### Advantages

- Self-hostable
- Mature open-source community
- Real-time collaboration
- Good fit for privacy-conscious organizations
- Existing adoption in education, research, and technical communities
- No dependency on a venture-backed hosted provider

### Limitations

- The 1.x codebase is maintenance-only while version 2 is being rewritten.
- Some collaboration features, particularly robust commenting and asynchronous review, have historically been incomplete or requested separately.
- Agent integration is not the central product narrative.
- The transition between major versions creates product and contributor uncertainty.

HedgeDoc is more likely to remain infrastructure or a self-hosted alternative than to define the commercial agent-document category.

---

## 6. Ritemark

**Position:** A local-first visual Markdown editor that exposes real project files to coding agents.

Ritemark describes itself as an open-source Markdown editor in which Claude, Codex, and Gemini can read and edit project files. It emphasizes:

- real Markdown files,
- local-first storage,
- visual editing,
- agent compatibility,
- desktop use on macOS and Windows.

Source: [Ritemark](https://ritemark.app/en/)

This is a different model from Composer or HackMD. The primary artifact is a local filesystem, and the editor makes those files approachable to humans.

### Advantages

- Avoids hosted-document lock-in
- Works naturally with repository-based agents
- Supports ordinary files and tools
- Open source
- Better alignment with local coding-agent environments

### Limitations

- Real-time collaboration is not its main strength.
- Sharing files with external collaborators remains difficult.
- Cross-device and permissions models are harder in local-first systems.
- It competes with existing local editors such as Obsidian, VS Code, and Typora.

Ritemark may be closer to “a humane interface for agent workspaces” than to Google Docs for Markdown.

---

## 7. MarkMorph and Shared Context

These are additional examples of the local agent-oriented direction.

MarkMorph presents itself as a Markdown editor through which tools such as Claude Code or Cursor can read and write a user’s knowledge base.

Source: [ITNEXT — MarkMorph](https://itnext.io/oops-i-built-a-markdown-editor-that-lets-ai-agents-write-into-my-notes-860a6cc5ec99)

Shared Context is described as a Mac desktop application that detects coding-agent projects and exposes skills, agents, MCP servers, and agent-produced Markdown or HTML files in a WYSIWYG editor.

Source: [Reddit — Shared Context](https://www.reddit.com/r/Markdown/comments/1tqj4vf/i_built_a_markdown_editor_specifically_for_ai/)

Both suggest that there may be a separate market for:

> a graphical control surface over files created and managed by agents

This could converge with collaborative Markdown, but it begins with a different customer problem.

---

# Adjacent competitors

## GitHub and GitLab

For developers, Git already provides:

- Markdown storage,
- authorship,
- history,
- branching,
- suggestions,
- review,
- permissions,
- agent access.

Its weakness is usability. Many nontechnical collaborators do not want to review prose in pull requests.

A strong product could effectively be:

> a Google Docs-quality interface backed by Git semantics

That may be more compelling than creating a separate document database.

## Notion

Notion offers strong human collaboration and increasingly capable APIs and AI features. Its block model, however, is not equivalent to native Markdown files. Export and import do not necessarily preserve a perfect round trip.

Notion can serve the human collaboration side but is less naturally interoperable with command-line agents.

## GitBook, Mintlify, and ReadMe

These products are oriented toward published documentation rather than arbitrary collaborative documents. They increasingly support Git sync, AI features, and machine-consumable documentation.

They may own the workflow once Markdown becomes **documentation**, but not necessarily during early drafting, research, and agent collaboration.

## Obsidian

Obsidian has arguably the strongest philosophical alignment with durable local Markdown. Its main limitation is multiplayer collaboration. Obsidian Sync synchronizes vaults, but Obsidian is not fundamentally a Google Docs-style real-time collaborative editor.

Source: [The Verge interview with Obsidian CEO Steph Ango](https://www.theverge.com/decoder-podcast-with-nilay-patel/760522/obsidian-ceo-steph-ango-kepano-productivity-software-notes-app)

## Google Docs

Google Docs supports some Markdown input and export behavior, but its canonical document representation is not Markdown. Its Markdown functionality has historically been formatting assistance rather than native Markdown collaboration.

Source: [Wired — Using Markdown in Google Docs](https://www.wired.com/story/how-to-use-markdown-google-docs/)

Google could still eliminate much of the market by making Docs reliably round-trip Markdown and exposing more capable agent APIs.

---

# Feature comparison

The following reflects publicly described capabilities rather than exhaustive hands-on testing.

| Product | Real-time human editing | Comments / suggestions | Agent integration | Native/local `.md` files | Self-hosted | Distinctive angle |
|---|---:|---:|---:|---:|---:|---|
| HackMD | Yes | Yes | MCP, CLI, API | Partial / export and sync | Enterprise options vary | Mature team workspace |
| Composer | Yes | Yes | First-class MCP agents | Unclear / hosted-first | Not publicly emphasized | Multiplayer humans + agents |
| Proof | Yes | Yes | First-class agents | Unclear / hosted-first | No | Agent provenance |
| Mist | Yes | Yes | File-friendly rather than deeply agent-specific | Strong orientation | Yes | Ephemeral, interoperable sharing |
| HedgeDoc | Yes | More limited | Not central | Import/export oriented | Yes | Open-source collaboration |
| Ritemark | Not primary | Not primary | Local coding agents | Yes | Local app | Visual editor over real files |
| Obsidian | Limited | Limited | Plugins and external agents | Yes | Local app | Durable personal knowledge base |
| GitHub | Asynchronous | Reviews and suggestions | Very strong | Yes | Enterprise server available | Git-native governance |

---

# What is genuinely new?

Collaborative Markdown itself is not new. Etherpad-style editing, CodiMD/HedgeDoc, and HackMD have existed for years.

Three things are new.

## 1. The agent is becoming an identifiable collaborator

Older editors added an AI command such as “rewrite this paragraph.” Newer products treat an agent as a participant that can enter, edit, comment, and potentially remain active.

That creates requirements such as:

- agent identity,
- scoped permissions,
- presence,
- assignable tasks,
- agent mentions,
- approval gates,
- limits on what each agent can edit.

## 2. Documents are becoming executable context

A Markdown document may now be simultaneously:

- a human-readable specification,
- a prompt,
- an agent’s memory,
- an execution plan,
- a task queue,
- a source of truth,
- a generated deliverable.

This makes document structure and machine access more important than in traditional word processors.

## 3. Provenance and approval are becoming first-class

When a document is mostly written manually, version history is often sufficient.

When several agents can continually rewrite it, teams need richer answers:

- Which model wrote this?
- Under whose instruction?
- What source did it rely on?
- Was the change reviewed?
- Did another agent revise it?
- Was it generated from confidential context?
- Which version was ultimately approved?

Proof is already moving in this direction, but the broader market has not solved it.

---

# The most important product tensions

## Hosted object versus real file

This is the category’s central architectural tension.

### Hosted object

Advantages:

- easy multiplayer editing,
- permissions,
- comments,
- stable links,
- presence,
- centralized history.

Disadvantages:

- lock-in,
- imperfect filesystem access,
- harder Git interoperability,
- agents require APIs or MCP tools.

### Real file

Advantages:

- works with every editor and coding agent,
- portable,
- Git-compatible,
- easy to automate,
- durable beyond the vendor.

Disadvantages:

- comments do not have a standard representation,
- concurrent edits are difficult,
- identity and permissions are external,
- share links require a synchronization layer.

The product that reliably supports a **lossless round trip** between these worlds could be valuable.

## WYSIWYG versus source Markdown

Nontechnical collaborators generally prefer a rich-text interface. Agents and developers generally prefer deterministic source text.

Many Markdown editors compromise by providing split panes or live preview. A stronger approach may be two fully equivalent views:

- a clean rich-text collaborative interface for humans,
- exact canonical Markdown for agents and tools.

The hard part is preserving unsupported constructs, comments, front matter, embedded HTML, directives, and custom syntax.

## Synchronous collaboration versus agent workflows

Google Docs assumes that several humans may be present simultaneously.

Agents frequently work asynchronously:

1. a user assigns a task,
2. an agent works,
3. it proposes a patch,
4. another agent reviews it,
5. a human approves it,
6. the document is published.

This resembles a pull request more than Google Docs. A product built only around colorful cursors may be solving the less important half of the problem.

## Document collaboration versus workspace collaboration

Agents rarely need just one document. They need related files, sources, attachments, code, datasets, and instructions.

Research on agent workspaces emphasizes cross-file dependencies and shows that current agents remain unreliable when they must reason across realistic large workspaces.

Source: [arXiv — Agent workspace research](https://arxiv.org/abs/2605.03596)

The larger opportunity may therefore be:

> collaborative, permissioned workspaces of machine-readable files

rather than a single collaborative Markdown editor.

---

# Where the market still looks open

## 1. Git-backed collaborative prose editing

A product that gives nontechnical users a Google Docs interface while maintaining a clean Git repository underneath could serve:

- product specifications,
- documentation,
- research,
- policy writing,
- proposals,
- agent instruction files,
- content publishing.

The essential requirement would be a lossless mapping between:

- comments and review threads,
- proposed edits,
- commits,
- branches,
- Markdown,
- agent changes.

Many products support Git sync. Few make Git invisible enough for ordinary collaborators while preserving its semantics.

## 2. Agent change review and governance

A strong product could be less of an editor and more of an **agent output review system**:

- every agent operation becomes a proposed change,
- changes include rationale and sources,
- humans or other agents approve them,
- sensitive sections require specific reviewers,
- policies control which agents can edit which content,
- the final artifact remains Markdown.

This would be closer to GitHub pull requests combined with Google Docs suggestions.

It also has a clearer enterprise willingness-to-pay story than generic collaborative writing.

## 3. Cross-agent document sessions

Composer points toward this, but the problem remains largely unsolved.

A document could function as a room in which:

- Claude researches,
- Codex edits technical sections,
- another model verifies citations,
- a human controls the final decision,
- each participant has separate permissions and context.

The durable product value would lie in orchestration, identity, and review rather than text editing.

## 4. A standard for portable comments and suggestions

Markdown itself does not provide a widely accepted way to represent:

- comments anchored to text ranges,
- suggested changes,
- user identities,
- resolved discussions,
- agent provenance.

Mist’s interest in storing collaboration metadata with the file is notable here.

A portable standard could allow a document to move between editors without losing its review state. The business might then be built around hosting, identity, synchronization, or enterprise policy.

## 5. External collaboration without accounts

This remains surprisingly awkward.

A developer may have a Markdown specification in a repository but need feedback from:

- a client,
- a lawyer,
- a designer,
- a subject matter expert,
- an executive.

Sending them to GitHub is often inappropriate. Importing the document into Google Docs breaks the source-of-truth relationship.

A shareable, temporary review URL connected to the original file is a strong narrow wedge.

## 6. Structured Markdown for agent workflows

Most products treat Markdown as generic prose. Agent-oriented documents could have typed or validated structures for:

- tasks,
- requirements,
- decisions,
- sources,
- unresolved questions,
- approvals,
- agent instructions,
- execution status.

The editor could display these visually while preserving plain text underneath.

That starts to resemble a lightweight, extensible operating system for knowledge work.

---

# Business and competitive outlook

## Why a standalone editor may be difficult

Basic collaborative editing is technically more accessible than it once was because products can use:

- ProseMirror, TipTap, or CodeMirror,
- Yjs or Automerge,
- hosted synchronization infrastructure,
- MCP,
- existing authentication and storage services,
- coding agents to accelerate development.

This explains why many polished new entrants can appear rapidly. It also means the editor itself provides a limited moat.

The proliferation may partly be a supply-side phenomenon: this is now an attractive application for a small team or individual to build.

## Possible moats

The more credible defensibility lies in:

- accumulated organization knowledge,
- deep Git and filesystem interoperability,
- enterprise identity and policy,
- proprietary collaboration metadata,
- review and approval workflows,
- integrations with agent runtimes,
- cross-document context graphs,
- auditability,
- trusted publishing pipelines,
- network effects around shared documents.

## Likely consolidation

The category is likely to evolve along these lines:

1. **HackMD adds most mainstream agent features**, serving technical teams that want a hosted workspace.
2. **GitHub, Notion, and documentation platforms absorb portions of the workflow.**
3. Several small “multiplayer Markdown” tools remain useful but niche.
4. One or two companies shift upward into agent governance, review, or workspace orchestration.
5. Open-source projects serve self-hosted and privacy-sensitive users.
6. Local-first tools become interfaces to agent-managed project directories.

In other words, “Google Docs for Markdown” may be the initial pitch, but probably not the final category.

---

# Assessment of current products

| Product | Current significance | Strategic outlook |
|---|---|---|
| **HackMD** | Highest maturity and existing distribution | Most likely to become the default hosted incumbent |
| **Composer** | Clearest agent-native multiplayer concept | Promising, but needs a moat beyond MCP collaboration |
| **Proof** | Strongest differentiated idea | Provenance could expand into a valuable governance layer |
| **Mist** | Best expression of the lightweight file-sharing problem | Strong open-source project; unclear standalone business |
| **HedgeDoc** | Most established self-hosted option | Durable community infrastructure rather than likely category winner |
| **Ritemark** | Strong local/file-first architecture | Could own the “human UI for agent files” niche |
| **Obsidian/GitHub** | Powerful adjacent substitutes | Could limit the total market available to dedicated editors |

---

# Bottom line

There is a real trend, but it consists of two overlapping markets.

## Collaborative Markdown

> Make Markdown as easy to share and review as Google Docs.

This is useful, but already crowded and vulnerable to incumbents.

## Agent-native documents

> Give humans and agents a shared, machine-readable artifact with identity, permissions, provenance, and review.

This is newer and potentially much more consequential.

The most compelling opportunities are probably not in building another rich-text Markdown editor. They are in solving one of the harder coordination problems around the editor:

- lossless Git/file interoperability,
- external review,
- agent permissions,
- proposed-change workflows,
- provenance,
- multi-agent collaboration,
- portable comments,
- workspace-level context.

A useful framing is that Google Docs solved **multiplayer presence for humans**, while GitHub solved **asynchronous, auditable changes to files**. The emerging product opportunity is to combine those models for teams in which some collaborators are agents.
