# NOMIK — The Living Blueprint

## 1. What Is NOMIK?

NOMIK is an **independent sidecar Knowledge Graph** that acts as the "Operating System" for technical and operational intelligence. It maintains a **persistent, multi-dimensional map** of how code, infrastructure, and business logic interact across disparate environments.

> [!IMPORTANT]
> NOMIK is NOT another code search tool. It is a **living semantic graph** that understands *relationships* between code entities — not just where they are, but *why they exist* and *what breaks if they change*.

## 2. The Problem: Context Rot

Standard LLMs suffer from "sliding window" context limits. Dumping a codebase into a prompt leads to:
- **Loss of detail** — deep relationships are truncated
- **Hallucinations** — the AI fills gaps with plausible-but-wrong information
- **No memory** — every conversation starts from zero

### The NOMIK Solution: Precision Retrieval

Instead of reading the whole repo, the AI **queries the graph** to pull only the specific nodes relevant to the task.

```
User asks: "What happens if I change the payment schema?"

Traditional RAG: Searches for files containing "payment" → returns 47 files → AI drowns

NOMIK: Traverses graph →
  DB_Table:payments
    ← WRITES_TO ← Function:process_payment()
      ← CALLED_BY ← Handler:POST /api/checkout
        ← DEPENDS_ON ← Component:CheckoutForm
    ← READS_FROM ← Function:generate_monthly_report()
      ← TRIGGERED_BY ← CronJob:monthly_billing

Result: 6 precise nodes instead of 47 noisy files
```

## 3. Beyond the AST — Runtime Semantics

| Standard IDE (AST) | NOMIK (Living Semantics) |
|---|---|
| Function signatures | HTTP endpoint → handler → service → DB chain |
| Import statements | External API calls (Stripe, AWS, Twilio) |
| Static references | Dynamic runtime workflows |
| Single-file scope | Cross-repo, cross-service dependencies |

## 4. The "AI-First" Paradigm

> Historically, code is organized for humans (folders/files). In the NOMIK era, organization is **for the AI**.

The **Code Fingerprint**: A self-healing, auto-populating mental model. If the AI has a perfect graph of the system, human-readable folder structures become secondary to **logical intent**.

## 5. Cross-Domain Intelligence

| Code Event | Infra State | Business Context | NOMIK Insight |
|---|---|---|---|
| Schema migration PR | Peak traffic detected | Data-integrity SLA | ⚠️ "Delay deploy 4h to avoid table locks" |
| New high-memory dep | Server at 70% RAM | Cost-reduction Q4 target | ⚠️ "Exceeds hardware, contradicts budget" |
| Remove legacy API | 2 workers still calling it | Built for Task-1234 in 2024 | ⚠️ "Removal breaks internal reporting" |
