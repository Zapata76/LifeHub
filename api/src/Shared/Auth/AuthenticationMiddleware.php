<?php

/**
 * Requires an authenticated server-side session for protected routes.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Auth;

use LifeHub\Shared\Http\JsonResponder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use PDO;

final class AuthenticationMiddleware
{
    /** @var ResponseFactory */
    private $responseFactory;
    /** @var PDO */
    private $pdo;

    public function __construct(ResponseFactory $responseFactory, PDO $pdo)
    {
        $this->responseFactory = $responseFactory;
        $this->pdo = $pdo;
    }

    public function __invoke(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $user = isset($_SESSION['user']) && is_array($_SESSION['user']) ? $_SESSION['user'] : null;
        if (
            $user === null
            || !isset(
                $user['id'],
                $user['householdId'],
                $user['role'],
                $user['username'],
                $user['sessionVersion']
            )
        ) {
            return JsonResponder::error(
                $this->responseFactory->createResponse(),
                401,
                'auth.required',
                'Authentication is required.',
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
        }

        $statement = $this->pdo->prepare(
            "SELECT id, household_id, role, username, session_version FROM lh_users "
            . "WHERE id = ? AND household_id = ? "
            . "AND status = 'active' AND archived_at IS NULL"
        );
        $statement->execute([(int) $user['id'], (int) $user['householdId']]);
        $current = $statement->fetch();
        if (!is_array($current) || (int) $current['session_version'] !== (int) $user['sessionVersion']) {
            unset($_SESSION['user']);
            return JsonResponder::error(
                $this->responseFactory->createResponse(),
                401,
                'auth.revoked',
                'The session is no longer active.',
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
        }

        $context = new UserContext(
            (int) $current['id'],
            (int) $current['household_id'],
            (string) $current['role'],
            (string) $current['username']
        );
        $_SESSION['user'] = array_merge($context->toArray(), [
            'sessionVersion' => (int) $current['session_version'],
        ]);

        return $handler->handle($request->withAttribute(UserContext::class, $context));
    }
}
