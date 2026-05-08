import clsx from "clsx";
import type { Message } from "@/lib/types";
import { formatTime, messageBodyOf } from "@/lib/format";

export default function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === "outbound";
  const body = messageBodyOf(message.content);
  const buttons = message.content?.buttons ?? [];

  return (
    <div className={clsx("flex mb-2", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[70%] px-3 py-2 rounded-lg text-sm shadow-sm",
          isOutbound
            ? message.status === "failed"
              ? "bg-red-100 text-red-900 border border-red-200"
              : "bg-brand-500 text-white"
            : "bg-white border border-slate-200 text-slate-900",
        )}
      >
        {body && <div className="whitespace-pre-wrap break-words">{body}</div>}
        {buttons.length > 0 && (
          <div className="mt-2 space-y-1">
            {buttons.map((b) => (
              <div
                key={b.id}
                className={clsx(
                  "text-xs px-2 py-1 rounded border text-center",
                  isOutbound
                    ? "border-white/40 bg-white/10"
                    : "border-slate-200 bg-slate-50",
                )}
              >
                {b.title}
              </div>
            ))}
          </div>
        )}
        <div
          className={clsx(
            "text-[10px] mt-1 flex items-center gap-1",
            isOutbound ? "text-white/70" : "text-slate-400",
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isOutbound && <span>· {message.status}</span>}
        </div>
      </div>
    </div>
  );
}
