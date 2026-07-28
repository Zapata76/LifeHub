<?php

/** Exposes the safe household-member lookup used by the task board. */

declare(strict_types=1);

namespace LifeHub\Tasks;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class TaskMemberController
{
    /** @var TaskMemberRepository */ private $members;

    public function __construct(TaskMemberRepository $members)
    {
        $this->members = $members;
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        return JsonResponder::write($response, ['items' => $this->members->list($user)]);
    }
}
