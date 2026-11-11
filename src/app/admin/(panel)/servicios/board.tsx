"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  startTransition,
  useId,
  useOptimistic,
  type CSSProperties,
  type ReactNode,
} from "react";
import { smallButton } from "@/components/ui";
import { formatEuros } from "@/lib/money";
import {
  formatDuration,
  photoUrl,
  type Section,
  type Service,
} from "@/lib/services";
import {
  deleteSection,
  reorderSections,
  reorderServices,
  setServiceVisible,
} from "./actions";
import { RenameSection } from "./section-forms";

// Lista que se ordena arrastrando el asa de cada fila (o con el teclado).
// El orden nuevo se muestra al instante y se guarda en el servidor.
function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  children: (item: T) => ReactNode;
}) {
  const id = useId();
  const [ordered, setOrdered] = useOptimistic(items);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((item) => item.id === active.id);
    const to = ordered.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(ordered, from, to);
    startTransition(async () => {
      setOrdered(next);
      await onReorder(next.map((item) => item.id));
    });
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={ordered.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {ordered.map((item) => children(item))}
      </SortableContext>
    </DndContext>
  );
}

function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  return { setNodeRef, style, isDragging, handle: { ...attributes, ...listeners } };
}

function Handle({
  label,
  handle,
}: {
  label: string;
  handle: ReturnType<typeof useSortableRow>["handle"];
}) {
  return (
    <button
      type="button"
      {...handle}
      aria-label={`Mover ${label}`}
      className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-border-strong active:cursor-grabbing"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="currentColor">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}

function ServiceRow({ service }: { service: Service }) {
  const { setNodeRef, style, isDragging, handle } = useSortableRow(service.id);
  const photo = photoUrl(service.photo_path);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`border-t border-border bg-white py-2 ${isDragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-1">
        <Link
          href={`/admin/servicios/${service.id}`}
          prefetch={false}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3"
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="size-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-tint text-center text-[11px] leading-tight text-muted">
              Sin foto
            </span>
          )}
          <span className="min-w-0">
            <span
              className={`block font-medium ${service.visible ? "" : "text-muted"}`}
            >
              {service.name}
            </span>
            <span className="block text-sm text-muted">
              {formatDuration(service.duration_min)} ·{" "}
              {formatEuros(service.price_cents)}
            </span>
          </span>
        </Link>
        <Handle label={service.name} handle={handle} />
      </div>
      <form
        action={setServiceVisible.bind(null, service.id, !service.visible)}
        className="flex items-center justify-between gap-3 pl-[68px]"
      >
        <span className="text-sm text-muted">
          {service.visible ? "Las clientas lo ven" : "Oculto para las clientas"}
        </span>
        <button className={smallButton}>
          {service.visible ? "Ocultar" : "Mostrar"}
        </button>
      </form>
    </li>
  );
}

function SectionCard({
  section,
  services,
}: {
  section: Section;
  services: Service[];
}) {
  const { setNodeRef, style, isDragging, handle } = useSortableRow(section.id);

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-labelledby={`section-${section.id}`}
      className={`rounded-2xl border border-border bg-white px-4 pt-2 pb-3 ${isDragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-2">
        <h2
          id={`section-${section.id}`}
          className="min-w-0 flex-1 text-lg font-semibold"
        >
          {section.name}
        </h2>
        <Handle label={`la sección ${section.name}`} handle={handle} />
      </div>

      <div className="-ml-3 flex flex-wrap items-start">
        <RenameSection id={section.id} name={section.name} />
        {services.length === 0 && (
          <form action={deleteSection.bind(null, section.id)}>
            <button className={smallButton}>Eliminar</button>
          </form>
        )}
      </div>

      {services.length === 0 ? (
        <p className="border-t border-border py-3 text-sm text-muted">
          Esta sección no tiene servicios.
        </p>
      ) : (
        <ul>
          <SortableList
            items={services}
            onReorder={reorderServices.bind(null, section.id)}
          >
            {(service) => <ServiceRow key={service.id} service={service} />}
          </SortableList>
        </ul>
      )}

      <Link
        href={`/admin/servicios/nuevo?seccion=${section.id}`}
        prefetch={false}
        className="mt-1 flex min-h-12 items-center justify-center rounded-xl border border-dashed border-border-strong font-medium text-primary"
      >
        Agregar servicio
      </Link>
    </section>
  );
}

export function ServicesBoard({
  sections,
  services,
}: {
  sections: Section[];
  services: Service[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <SortableList items={sections} onReorder={reorderSections}>
        {(section) => (
          <SectionCard
            key={section.id}
            section={section}
            services={services.filter((s) => s.section_id === section.id)}
          />
        )}
      </SortableList>
    </div>
  );
}
