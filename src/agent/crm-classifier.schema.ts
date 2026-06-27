// CRM Classifier Schema — Clínica QARA

export type PipelineFunil =
  | "1-unhas"
  | "2-cirurgia"
  | "3-tricologia"
  | "4-inflamatorias"
  | "5-dermatopediatria"
  | "6-dermatologia-clinica"
  | "7-podologia"
  | "8-administrativo"
  | "9-reativacao";

export type EtapaFunil =
  | "novo-lead"
  | "qualificado"
  | "horario-oferecido"
  | "agendado"
  | "confirmado"
  | "atendido"
  | "reagendado"
  | "perdido"
  | "alta-manutencao";

export type Prioridade = "P1" | "P2" | "P3" | "P4";
export type Temperatura = "Quente" | "Morno" | "Frio";

export type MedicoIndicado =
  | "Dr. Miguel Ceccarelli"
  | "Dr. Diego Galvez"
  | "Dra. Manuela Pedretti Cabral"
  | "Dra. Diana Stohmann"
  | "Dr. Fabrício de Andrade"
  | "Regina"
  | "A definir";

export type Unidade = "copacabana" | "barra" | "sp-itaim" | "teleconsulta" | "a-definir";

export interface CrmClassifierOutput {
  mensagem_paciente: string;
  crm: {
    pipeline_funil: PipelineFunil;
    etapa_funil: EtapaFunil;
    especialidade_original: string | null;
    subespecialidade_queixa: string | null;
    medico_indicado: MedicoIndicado;
    unidade: Unidade;
    tags: string[];
    prioridade: Prioridade;
    temperatura: Temperatura;
    origem:
      | "pagina-site"
      | "anuncio"
      | "instagram"
      | "doctoralia"
      | "indicacao"
      | "retorno-direto"
      | "nao-identificada";
    paciente_novo_ou_antigo: "novo" | "antigo-retorno" | "antigo-lembrete" | "indeterminado";
    precisa_humano_agora: boolean;
    motivo_alerta: string | null;
    proxima_acao: string;
    campos_faltantes: string[];
    nota_resumida: string;
  };
  acoes_internas: string[];
}

// Regras obrigatórias:
// - Se prioridade = P1, precisa_humano_agora deve ser true.
// - Se teleconsulta ainda não foi paga, etapa não deve ser "confirmado".
// - Se foto foi recebida, aplicar tag "alerta:foto-recebida" e nunca gerar diagnóstico.
// - Se paciente perguntar sobre convênio, aplicar "alerta:plano-nao-aceito".
// - Se for retorno/pós-operatório, manter pipeline da especialidade original quando conhecido.
// - Se NPS < 9, não solicitar avaliação Google automaticamente.
