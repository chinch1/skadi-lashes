"use client";

import { primaryButton, secondaryButton } from "@/components/ui";
import { approveDeposit, rejectDeposit } from "../agenda-actions";
import { ActionError, useAgendaAction } from "./use-agenda-action";

export function DepositActions({ depositId }: { depositId: string }) {
  const { pending, running, error, run } = useAgendaAction();

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("approve", () => approveDeposit(depositId))}
          className={primaryButton}
        >
          {running === "approve" ? "Aprobando…" : "Aprobar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              "reject",
              () => rejectDeposit(depositId),
              "¿Rechazar este comprobante? El horario se libera de inmediato.",
            )
          }
          className={`${secondaryButton} bg-white`}
        >
          {running === "reject" ? "Rechazando…" : "Rechazar"}
        </button>
      </div>
      <ActionError error={error} />
    </div>
  );
}
