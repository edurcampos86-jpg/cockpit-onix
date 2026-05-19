-- Aliases de e-mail "tambem sou eu" pra heuristica de forwards.
-- CSV simples — sem normalizacao de schema porque a lista tipicamente tem
-- 1-3 entradas por usuario.
ALTER TABLE "UserGoogleAuth" ADD COLUMN "aliases" TEXT;
