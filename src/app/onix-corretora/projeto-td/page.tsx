export const dynamic = "force-dynamic";

import { RoadmapClient } from "./roadmap-client";
import {
  ROADMAP,
  getMesAtualRoadmap,
  getAnoAtual,
  getProgressoProjeto,
  getStatusFaseRoadmap,
  mesParaData,
} from "@/lib/roadmap-data";

export const metadata = {
  title: "Roadmap T&D — Onix Corretora",
};

export default function ProjetoTDPage() {
  const mesAtual = getMesAtualRoadmap();
  const anoAtual = getAnoAtual();
  const progressoProjeto = getProgressoProjeto();

  // Computar status de todas as fases
  const anos = ROADMAP.map((ano) => ({
    ...ano,
    fases: ano.fases.map((fase) => ({
      ...fase,
      status: getStatusFaseRoadmap(fase),
      labelInicio: mesParaData(fase.mesInicio),
      labelFim: mesParaData(fase.mesFim),
    })),
  }));

  // Contadores
  const todasFases = anos.flatMap((a) => a.fases);
  const concluidas = todasFases.filter((f) => f.status === "concluida").length;
  const emAndamento = todasFases.filter((f) => f.status === "em_andamento").length;
  const total = todasFases.length;

  return (
    <RoadmapClient
      anos={anos}
      mesAtual={mesAtual}
      anoAtual={anoAtual}
      progressoProjeto={progressoProjeto}
      contadores={{ total, concluidas, emAndamento }}
    />
  );
}
