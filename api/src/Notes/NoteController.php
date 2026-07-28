<?php

/**
 * Validates note commands and exposes the shared household note API.
 */

declare(strict_types=1);

namespace LifeHub\Notes;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class NoteController
{
    /** @var NoteRepository */ private $notes;
    /** @var AuditLogger */ private $audit;

    public function __construct(NoteRepository $notes, AuditLogger $audit)
    {
        $this->notes = $notes;
        $this->audit = $audit;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $archived = isset($query['archived']) && (string) $query['archived'] === '1';
        return JsonResponder::write($response, $this->notes->overview($this->user($request), $archived));
    }

    /** @param array<string, string> $args */
    public function detail(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return JsonResponder::write(
            $response,
            ['item' => $this->notes->detail($this->user($request), (int) $args['id'])]
        );
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $id = $this->notes->create($user, $this->note(new RequestData($request)));
        $this->record($request, $user, 'note.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->notes->update($user, $id, $data->requiredInt('version'), $this->note($data));
        $this->record($request, $user, 'note.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function pin(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $pinned = $data->optionalBool('pinned');
        if ($pinned === null) {
            throw new ApiException(422, 'validation.required', 'pinned is required.');
        }
        $id = (int) $args['id'];
        $this->notes->setPinned($user, $id, $data->requiredInt('version'), $pinned);
        $this->record($request, $user, 'note.pin_changed', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function archive(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        return $this->archiveState($request, $response, $args, true);
    }

    /** @param array<string, string> $args */
    public function restore(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        return $this->archiveState($request, $response, $args, false);
    }

    /** @param array<string, string> $args */
    public function removeImage(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $this->notes->removeImage($user, $id);
        $this->record($request, $user, 'note.image_removed', $id);
        return JsonResponder::write($response, ['removed' => true]);
    }

    /** @return array<string, mixed> */
    private function note(RequestData $data): array
    {
        $title = $data->optionalString('title', 255) ?: '';
        $body = $data->optionalString('body', 50000) ?: '';
        if ($title === '' && $body === '') {
            throw new ApiException(422, 'note.empty', 'A title or content is required.');
        }
        $color = strtolower($data->optionalString('color', 7) ?: '#1e1e1e');
        if (preg_match('/^#[0-9a-f]{6}$/', $color) !== 1) {
            throw new ApiException(422, 'note.color_invalid', 'The note color is invalid.');
        }
        return [
            'title' => $title,
            'body' => $body,
            'color' => $color,
            'pinned' => $data->optionalBool('pinned') ?? false,
        ];
    }

    /** @param array<string, string> $args */
    private function archiveState(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
        bool $archived
    ): ResponseInterface {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->notes->setArchived($user, $id, $data->requiredInt('version'), $archived);
        $this->record($request, $user, $archived ? 'note.archived' : 'note.restored', $id);
        return JsonResponder::write($response, [$archived ? 'archived' : 'restored' => true]);
    }

    private function user(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        return $user;
    }

    private function record(ServerRequestInterface $request, UserContext $user, string $event, int $id): void
    {
        $this->audit->record(
            $user,
            $event,
            'note',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
