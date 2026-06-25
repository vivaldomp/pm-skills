# New document standard => SAD (System Architecture Document)

I'm missing a critical link between product vision and technical implementation: The Architecture Design / System Context (often represented as a SAD or System Architecture Document).

Moving directly from a Software Requirements Specification (SRS) to a Software Design Description (SDD) creates a massive structural gap.

## The Missing Link: Architecture Design

The sequence jumps straight from what the software must do (SRS) to how a specific component or module is built (SDD). It skips defining the high-level skeleton of the entire ecosystem.
Adding an architecture design step clarifies the system boundaries, data flow pipelines, and overall technology stack before developers dive into granular code-level designs.

## The Complete, Industry-Standard Sequence

To build software robustly from ideation to production, the optimized sequence looks like this:

[PRD] ➔ [SRS] ➔ [SAD / System Architecture] ➔ [SDD] ➔ [ADR]


   1. PRD (Product Requirements Document): Explains the market problem, user personas, business value, and high-level product features (The "Why" and "What"). 
   2. SRS (Software Requirements Specification): Translates the PRD into rigorous, unambiguous functional and non-functional engineering requirements (The "What" and "Constraints").
   3. SAD (System Architecture Document / Context Map): [MISSING STEP] Maps out the high-level technical blueprints, infrastructure, macro-services, database types, and system boundaries (The "Where" and "Big Picture").
   4. SDD (Software Design Description): Drills down into the low-level architecture of specific modules, detailing class diagrams, API endpoints, schemas, and exact code design (The "How").
   5. ADR (Architecture Decision Record): Captures the historical log of specific, high-impact choices made during steps 3 and 4, along with their trade-offs (The "Why we chose this over that"). 

------------------------------
## Other Minor Elements to Consider (Depending on Team Size)

* UI/UX Wireframes/Figma Prototypes: These should sit alongside the PRD and SRS. Technical teams cannot effectively write an SRS or SDD without knowing the intended user interaction flow.
* Test Plan / BDD Specifications: Often written concurrently with the SRS to define exactly how the engineering team will validate that the requirements have been successfully built.

# How to SAD fit into current transition

The SAD (System Architecture Document) acts as the bridge between requirements and implementation. It sits exactly between your SRS and your SDD to translate what the system must do into where and how those components will live at a macro level.
Here is exactly how the SAD fits into your current transition, how it interacts with the documents around it, and what it should contain.

## The Transition Flow: SRS ➔ SAD ➔ SDD

To understand how it fits, look at how the level of abstraction shifts as you move through the sequence:

[ SRS ] ➔ Translates Product goals into Functional & Non-Functional Requirements.
   ↓
[ SAD ] ➔ (Macro-Design) Organizes those requirements into a high-level technical blueprint.
   ↓
[ SDD ] ➔ (Micro-Design) Takes one specific piece of that blueprint and maps out the code.


   1. Input from SRS to SAD: The SAD looks at your SRS—specifically the Non-Functional Requirements (NFRs) like scalability, security, performance, and expected user load.
   2. The SAD's Job: The architect uses the SAD to answer major structural questions: Should we use microservices or a monolith? Do we use a relational database or NoSQL? Where will this be hosted (AWS, Azure)? How will data flow between systems?
   3. Output from SAD to SDD: Once the SAD defines the overall layout (e.g., "We will have an Auth Service, a Payment Service, and a PostgreSQL database"), the SDD takes over. Developers write an SDD for each specific service to detail the exact API routes, database tables, and class code structure.

## What Exactly Goes Inside the SAD?

While an SRS lists text requirements and an SDD shows class/database structures, a SAD relies heavily on architectural diagrams (like the C1/C2/C3 levels of the [C4 Model](https://c4model.com/)).

A lean, modern SAD includes:

* System Context Diagram: A high-level view showing how your software interacts with users and external third-party systems (e.g., payment gateways, CRM tools).
* Container/Infrastructure Diagram: Shows the high-level technology choices (e.g., React frontend, Node.js API container, Redis cache, AWS S3 bucket).
* Data Flow & Integration Patterns: Maps out how components talk to each other (e.g., REST APIs, GraphQL, or asynchronous event-driven messaging via Kafka).
* Security & Compliance Architecture: Details how data is encrypted, how users are authenticated (OAuth2, JWT), and how network perimeters are secured.

## How SAD Interacts with ADR

As you design your SAD, you will inevitably face hard technical choices (e.g., Choosing PostgreSQL vs. MongoDB).
Instead of cluttering the SAD with your reasoning, you make the structural choice in the SAD, and you spin up an ADR (Architecture Decision Record) to document the why.

* SAD states: "The system will use an asynchronous event-driven architecture using Apache Kafka."
* ADR-004 states: "Why we chose Apache Kafka over RabbitMQ (Trade-offs, performance benchmarks, and cost analysis)."

## Summary of the Shift

| Document | Responsibility | Focus | Analogy |
|---|---|---|---|
| SRS | Requirements | Functional & Non-Functional Rules | The building's zoning rules and room count |
| SAD (New) | Macro-Architecture | System boundaries, infra, and data pipelines | The structural blueprint (plumbing, electricity, columns) |
| SDD | Micro-Design | Code classes, exact schemas, local logic | The interior design and furniture layout of one room |
