-- ============================================================
-- SISTEMA DE GESTÃO DE VISITAS - MySQL / Hostinger phpMyAdmin
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. TABELA FUNÇÕES
CREATE TABLE IF NOT EXISTS `funcoes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nome` VARCHAR(100) NOT NULL,
    `ativo` TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY `uk_funcoes_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABELA USUÁRIOS
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nome` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `senha_hash` VARCHAR(255) NOT NULL,
    `escopo` ENUM('adm','user') NOT NULL DEFAULT 'user',
    `funcao_id` INT DEFAULT NULL,
    `ativo` TINYINT(1) NOT NULL DEFAULT 1,
    `tentativas_falhas` INT NOT NULL DEFAULT 0,
    `bloqueado_ate` DATETIME DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_usuarios_email` (`email`),
    KEY `idx_usuarios_funcao` (`funcao_id`),
    KEY `idx_usuarios_ativo` (`ativo`),
    CONSTRAINT `fk_usuarios_funcao`
        FOREIGN KEY (`funcao_id`) REFERENCES `funcoes`(`id`)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABELA LOCAIS
CREATE TABLE IF NOT EXISTS `locais` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nome` VARCHAR(200) NOT NULL,
    `cidade` VARCHAR(150) NOT NULL,
    `ativo` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_locais_nome_cidade` (`nome`, `cidade`),
    KEY `idx_locais_cidade` (`cidade`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. TABELA TAREFAS
CREATE TABLE IF NOT EXISTS `tarefas` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nome` VARCHAR(200) NOT NULL,
    `descricao` TEXT,
    `ativo` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_tarefas_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. TABELA AGENDAMENTOS
CREATE TABLE IF NOT EXISTS `agendamentos` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `usuario_id` INT NOT NULL,
    `local_id` INT NOT NULL,
    `tarefa_id` INT NOT NULL,
    `data` DATE NOT NULL,
    `periodo` VARCHAR(150) NOT NULL,
    `status` ENUM('planejado','concluido') NOT NULL DEFAULT 'planejado',
    `objetivo` TEXT,
    `resumo` TEXT,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_agendamentos_usuario` (`usuario_id`),
    KEY `idx_agendamentos_data` (`data`),
    KEY `idx_agendamentos_local` (`local_id`),
    KEY `idx_agendamentos_status` (`status`),
    KEY `idx_agendamentos_periodo` (`periodo`),
    KEY `idx_agendamentos_tarefa` (`tarefa_id`),
    KEY `idx_agendamentos_usuario_data` (`usuario_id`, `data`),
    KEY `idx_agendamentos_data_local` (`data`, `local_id`),
    KEY `idx_agendamentos_data_local_periodo` (`data`, `local_id`, `periodo`),
    CONSTRAINT `fk_agendamentos_usuario`
        FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `fk_agendamentos_local`
        FOREIGN KEY (`local_id`) REFERENCES `locais`(`id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `fk_agendamentos_tarefa`
        FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. TABELA TOKENS (Reset de Senha)
CREATE TABLE IF NOT EXISTS `tokens` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `usuario_id` INT NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `tipo` VARCHAR(30) NOT NULL DEFAULT 'recuperacao',
    `expira_em` DATETIME NOT NULL,
    `usado` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_tokens_token` (`token_hash`),
    KEY `idx_tokens_usuario` (`usuario_id`),
    CONSTRAINT `fk_tokens_usuario`
        FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. TABELA ACESSOS_LOG (Auditoria)
CREATE TABLE IF NOT EXISTS `acessos_log` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `usuario_id` INT DEFAULT NULL,
    `email` VARCHAR(150) NOT NULL,
    `ip` VARCHAR(45) NOT NULL,
    `user_agent` VARCHAR(255) DEFAULT NULL,
    `sucesso` TINYINT(1) NOT NULL,
    `motivo` VARCHAR(100) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_log_email` (`email`),
    KEY `idx_log_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. CARGA INICIAL PADRÃO
INSERT IGNORE INTO `funcoes` (`id`, `nome`) VALUES
(1, 'Professor'),
(2, 'Coordenador'),
(3, 'Diretor'),
(4, 'Supervisor'),
(5, 'Articulador'),
(6, 'Especialista');

INSERT IGNORE INTO `tarefas` (`id`, `nome`, `descricao`) VALUES
(1, 'Acompanhamento pedagógico', 'Acompanhamento do trabalho pedagógico'),
(2, 'Observação de aula', 'Observação em sala de aula'),
(3, 'Reunião com coordenação', 'Reunião com a equipe de coordenação'),
(4, 'Reunião com direção', 'Reunião com a direção da escola'),
(5, 'Formação', 'Formação de professores'),
(6, 'Acompanhamento de plataforma', 'Suporte à plataforma digital'),
(7, 'Avaliação', 'Avaliação de desempenho');

SET FOREIGN_KEY_CHECKS = 1;
