-- ============================================================
-- MIGRAÇÃO: coluna agendamentos.periodo  (execute UMA vez no phpMyAdmin)
-- Corrige bancos criados em versões antigas, em que `periodo` era
-- ENUM('manha','tarde','noite') e não aceitava vários períodos
-- (o que fazia o "Salvar" falhar ao marcar mais de um período).
-- Faça um backup (Exportar) antes.
-- ============================================================

-- 1) Garante que a coluna aceita texto/JSON
ALTER TABLE `agendamentos` MODIFY `periodo` VARCHAR(150) NOT NULL;

-- 2) Converte registros antigos ("manha" ou "manha,tarde") para JSON (["manha","tarde"])
UPDATE `agendamentos`
SET `periodo` = CONCAT('["', REPLACE(REPLACE(`periodo`, ' ', ''), ',', '","'), '"]')
WHERE `periodo` NOT LIKE '[%';

-- 3) Conferência: deve listar só valores no formato ["..."]
SELECT DISTINCT `periodo` FROM `agendamentos`;
