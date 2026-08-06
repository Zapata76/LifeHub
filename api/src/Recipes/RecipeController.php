<?php

/**
 * Validates recipe aggregates and exposes the dedicated household recipe API.
 */

declare(strict_types=1);

namespace LifeHub\Recipes;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class RecipeController
{
    /** @var RecipeRepository */ private $recipes;
    /** @var AuditLogger */ private $audit;

    public function __construct(RecipeRepository $recipes, AuditLogger $audit)
    {
        $this->recipes = $recipes;
        $this->audit = $audit;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponder::write($response, $this->recipes->overview($this->user($request)));
    }

    /** @param array<string, string> $args */
    public function detail(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $item = $this->recipes->detail($this->user($request), (int) $args['id']);
        return JsonResponder::write($response, ['item' => $item]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = $this->recipes->create($user, $this->recipe($data), $this->ingredients($data));
        $this->record($request, $user, 'recipe.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->recipes->update(
            $user,
            $id,
            $data->requiredInt('version'),
            $this->recipe($data),
            $this->ingredients($data)
        );
        $this->record($request, $user, 'recipe.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function archive(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $this->recipes->archive($user, $id, (new RequestData($request))->requiredInt('version'));
        $this->record($request, $user, 'recipe.archived', $id);
        return JsonResponder::write($response, ['archived' => true]);
    }

    /** @param array<string, string> $args */
    public function removeImage(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $this->recipes->removeImage($user, $id);
        $this->record($request, $user, 'recipe.image_removed', $id);
        return JsonResponder::write($response, ['removed' => true]);
    }

    /** @return array<string, mixed> */
    private function recipe(RequestData $data): array
    {
        $prepTime = $data->optionalInt('prepTimeMinutes');
        if ($prepTime !== null && ($prepTime < 1 || $prepTime > 1440)) {
            throw new ApiException(
                422,
                'recipe.prep_time_invalid',
                'Preparation time must be between 1 and 1440 minutes.'
            );
        }
        $difficulty = $data->optionalString('difficulty', 30) ?: 'media';
        if (!in_array($difficulty, ['bassa', 'media', 'alta'], true)) {
            throw new ApiException(422, 'recipe.difficulty_invalid', 'Difficulty is invalid.');
        }
        $servings = $data->optionalInt('servings');
        if ($servings !== null && ($servings < 1 || $servings > 100)) {
            throw new ApiException(
                422,
                'recipe.servings_invalid',
                'Servings must be between 1 and 100 people.'
            );
        }
        return [
            'title' => $data->requiredString('title', 255),
            'category' => $data->optionalString('category', 100) ?: '',
            'description' => $data->optionalString('description', 20000) ?: '',
            'instructions' => $data->optionalString('instructions', 50000) ?: '',
            'prepTimeMinutes' => $prepTime,
            'difficulty' => $difficulty,
            'servings' => $servings,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function ingredients(RequestData $data): array
    {
        $raw = $data->value('ingredients');
        if (!is_array($raw)) {
            throw new ApiException(422, 'recipe.ingredients_invalid', 'Ingredients must be a list.');
        }
        if (count($raw) > 100) {
            throw new ApiException(422, 'recipe.ingredients_limit', 'A recipe can contain at most 100 ingredients.');
        }
        $ingredients = [];
        foreach ($raw as $row) {
            if (!is_array($row)) {
                throw new ApiException(422, 'recipe.ingredient_invalid', 'Each ingredient must be an object.');
            }
            $productId = $this->nullablePositiveInt($row['productId'] ?? null);
            $name = $this->shortString($row['name'] ?? '', 255, 'ingredient name');
            $quantity = $this->shortString($row['quantity'] ?? '', 100, 'ingredient quantity');
            if ($productId === null && $name === '') {
                continue;
            }
            $ingredients[] = ['productId' => $productId, 'name' => $name, 'quantity' => $quantity];
        }
        return $ingredients;
    }

    /** @param mixed $value */
    private function nullablePositiveInt($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        $filtered = filter_var($value, FILTER_VALIDATE_INT);
        if ($filtered === false || (int) $filtered < 1) {
            throw new ApiException(422, 'validation.positive', 'productId must be positive.');
        }
        return (int) $filtered;
    }

    /** @param mixed $value */
    private function shortString($value, int $max, string $field): string
    {
        if (!is_string($value)) {
            throw new ApiException(422, 'validation.string', $field . ' must be a string.');
        }
        $value = trim($value);
        if (mb_strlen($value, 'UTF-8') > $max) {
            throw new ApiException(422, 'validation.length', $field . ' is too long.');
        }
        return $value;
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
            'recipe',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
