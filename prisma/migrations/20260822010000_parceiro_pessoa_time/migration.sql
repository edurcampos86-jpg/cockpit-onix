-- Parceiro.pessoaId — a ponte com o cadastro do Time.
--
-- Migration 100% ADITIVA: uma coluna nullable, um índice e uma FK. Nenhuma
-- linha existente é lida ou reescrita, e o valor nasce NULL em todas.
--
-- ─────────────────────────────────────────────────────────────────────────
-- GÊMEO DE "clienteBackofficeId", DE PROPÓSITO
-- ─────────────────────────────────────────────────────────────────────────
-- A #306 criou "Parceiro"."clienteBackofficeId" para responder "este parceiro
-- também é cliente da casa?". Falta o outro lado da mesma pergunta: "este
-- parceiro também é do TIME?".
--
-- É o caso concreto do Renan — sócio da Onix Imobiliária, com cadastro em
-- "Pessoa" (CPF e e-mail únicos), e que hoje é recadastrado à mão na tela de
-- parceiro. Duas grafias do mesmo humano: a ficha do cliente mostra uma, a
-- ficha do time mostra outra.
--
-- Mesma forma do campo irmão, incluindo as decisões:
--
--   UNIQUE      uma pessoa representa no máximo um parceiro. Sem isso, dois
--               cadastros reivindicariam a mesma pessoa e nenhuma leitura
--               futura saberia qual vale.
--
--   ON DELETE   SET NULL. Arquivar a pessoa não pode apagar o parceiro: ele
--               segue existindo como quem indica, só perde o elo com o time.
--
--   NULLABLE    a maioria dos parceiros NÃO é do time, e essa é a razão de a
--               entidade existir. Exigir pessoa seria a limitação que a #306
--               veio remover.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE ESTA COLUNA TORNA VISÍVEL — e que ela NÃO resolve
-- ─────────────────────────────────────────────────────────────────────────
-- Com pessoa e parceiro ligados, fica evidente que o MESMO humano pode ter
-- "AcordoComercial" (o do time: pro_labore, split) e "AcordoComercialParceiro"
-- vigentes ao mesmo tempo — e as duas tabelas não se enxergam. Hoje a única
-- defesa contra pagar duas vezes pelo mesmo negócio é convenção (gravar 0% no
-- nó onde a pessoa já é remunerada), não trava.
--
-- Esta migration NÃO instala essa guarda, de propósito: a regra ainda não foi
-- decidida e depende do Financeiro. Registrada em docs/onix-co-estado.md como
-- "RISCO DE PAGAMENTO DUPLO", para não virar descoberta de fechamento.
--
-- SEM BACKFILL: nenhuma linha é ligada automaticamente. Casar parceiro com
-- pessoa por semelhança de nome é exatamente o tipo de palpite que produz
-- vínculo errado — e vínculo de identidade errado é pior que ausência dele.
--
-- Rollback:
--   ALTER TABLE "Parceiro" DROP CONSTRAINT "Parceiro_pessoaId_fkey";
--   DROP INDEX "Parceiro_pessoaId_key";
--   ALTER TABLE "Parceiro" DROP COLUMN "pessoaId";

-- AlterTable
ALTER TABLE "Parceiro" ADD COLUMN     "pessoaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Parceiro_pessoaId_key" ON "Parceiro"("pessoaId");

-- AddForeignKey
ALTER TABLE "Parceiro" ADD CONSTRAINT "Parceiro_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
