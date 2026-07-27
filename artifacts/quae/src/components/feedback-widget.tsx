import { useState } from "react";
import { MessageSquare, X, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Step = "closed" | "open" | "sent";

export default function FeedbackWidget() {
  const [step, setStep] = useState<Step>("closed");
  const [type, setType] = useState<"bug" | "idea" | "other">("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message, email }),
      });
    } catch {
      // Fire-and-forget — don't block the UI on network errors
    } finally {
      setLoading(false);
      setStep("sent");
      setTimeout(() => {
        setStep("closed");
        setMessage("");
        setEmail("");
        setType("idea");
      }, 3000);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Panel */}
      {step === "open" && (
        <div className="w-80 rounded-2xl border border-white/10 bg-[#0f0f14] shadow-2xl shadow-black/60 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <img src="/images/logo-icon.png" alt="Quae.ai" className="h-5 w-5 rounded-md object-cover" />
              <span className="text-sm font-semibold text-white">Share feedback</span>
            </div>
            <button onClick={() => setStep("closed")} className="text-muted-foreground hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            {/* Type selector */}
            <div className="flex gap-2">
              {(["idea", "bug", "other"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all border ${
                    type === t
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:text-white"
                  }`}
                >
                  {t === "idea" ? "💡 Idea" : t === "bug" ? "🐛 Bug" : "💬 Other"}
                </button>
              ))}
            </div>

            <Textarea
              placeholder="What's on your mind?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="resize-none text-sm min-h-[90px] bg-white/5 border-white/10 focus:border-primary/50"
              autoFocus
            />

            <Input
              type="email"
              placeholder="Email (optional, for replies)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-sm bg-white/5 border-white/10 focus:border-primary/50"
            />

            <Button
              className="w-full font-semibold gap-2"
              onClick={handleSubmit}
              disabled={loading || !message.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              {loading ? "Sending…" : "Send Feedback"}
            </Button>
          </div>
        </div>
      )}

      {/* Thank-you state */}
      {step === "sent" && (
        <div className="w-72 rounded-2xl border border-green-500/30 bg-[#0f0f14] shadow-2xl px-5 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Thanks for the feedback!</p>
            <p className="text-xs text-muted-foreground">We read every message.</p>
          </div>
        </div>
      )}

      {/* Trigger button */}
      {step !== "sent" && (
        <button
          onClick={() => setStep(step === "open" ? "closed" : "open")}
          className={`flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg shadow-black/40 border transition-all font-medium text-sm ${
            step === "open"
              ? "bg-white/10 border-white/20 text-white"
              : "bg-primary border-primary/50 text-white hover:bg-primary/90"
          }`}
        >
          <img src="/images/logo-icon.png" alt="" className="h-4 w-4 rounded object-cover" />
          {step === "open" ? <X className="h-3.5 w-3.5" /> : <span>Feedback</span>}
        </button>
      )}
    </div>
  );
}
