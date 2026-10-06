require_once __DIR__ . '/env-loader.php';

/**
 * Procura o .env subindo a partir de um diretório, até um limite.
 * Ordem testada:
 *   $inicio/.env
 *   dirname($inicio,1)/.env
 *   dirname($inicio,2)/.env
 *   ...
 * O primeiro que existir e for legível é carregado.
 *
 * @param string $inicio   Diretório de partida (normalmente __DIR__)
 * @param int    $maxNiveis Quantos níveis acima ainda tentar
 * @return string|null     Caminho absoluto do .env encontrado, ou null
 */
function localizarEnv(string $inicio, int $maxNiveis = 4): ?string {
    $dir = $inicio;
    for ($i = 0; $i <= $maxNiveis; $i++) {
        $candidato = $dir . DIRECTORY_SEPARATOR . '.env';
        if (is_file($candidato) && is_readable($candidato)) {
            return $candidato;
        }
        $pai = dirname($dir);
        if ($pai === $dir) break; // chegou na raiz do sistema
        $dir = $pai;
    }
    return null;
}

$envPath = localizarEnv(__DIR__, 4);

if ($envPath === null) {
    // Não achou em nenhum nível — mensagem clara em vez de 500 genérico
    error_log('[config] .env não encontrado a partir de ' . __DIR__);
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['erro' => 'Configuração indisponível']);
    exit;
}

carregarEnv($envPath);
