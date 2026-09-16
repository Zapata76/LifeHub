<?php

/** Stores one subscription per browser, with household and account ownership. */

declare(strict_types=1);

namespace LifeHub\Push;

use LifeHub\Shared\Auth\UserContext;
use PDO;

final class PushSubscriptionRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function save(UserContext $user, PushSubscription $subscription): void
    {
        // Atomic upsert also reassigns a shared browser after an explicit opt-in by its new user.
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_push_subscriptions '
            . '(household_id, user_id, session_version, endpoint_hash, endpoint, '
            . 'public_key, auth_token, created_at, updated_at) '
            . 'SELECT household_id, id, session_version, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM lh_users '
            . "WHERE household_id = ? AND id = ? AND status = 'active' AND archived_at IS NULL "
            . 'ON DUPLICATE KEY UPDATE household_id = VALUES(household_id), user_id = VALUES(user_id), '
            . 'session_version = VALUES(session_version), public_key = VALUES(public_key), '
            . 'auth_token = VALUES(auth_token), updated_at = VALUES(updated_at)'
        );
        $statement->execute([
            hash('sha256', $subscription->endpoint), $subscription->endpoint, $subscription->publicKey,
            $subscription->authToken, $user->householdId(), $user->id(),
        ]);
    }

    public function remove(UserContext $user, string $endpoint): void
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM lh_push_subscriptions WHERE household_id = ? AND user_id = ? AND endpoint_hash = ?'
        );
        $statement->execute([$user->householdId(), $user->id(), hash('sha256', $endpoint)]);
    }

    /** @return list<array<string, mixed>> */
    public function recipients(UserContext $actor): array
    {
        $statement = $this->pdo->prepare(
            'SELECT s.*, u.role FROM lh_push_subscriptions s JOIN lh_users u '
            . 'ON u.household_id = s.household_id AND u.id = s.user_id AND u.session_version = s.session_version '
            . "WHERE s.household_id = ? AND s.user_id <> ? AND u.status = 'active' AND u.archived_at IS NULL "
            . 'ORDER BY s.id'
        );
        $statement->execute([$actor->householdId(), $actor->id()]);
        return $statement->fetchAll();
    }

    public function removeExpired(int $id, string $endpoint, string $authToken): void
    {
        // Do not remove a concurrently refreshed/replaced subscription.
        $statement = $this->pdo->prepare(
            'DELETE FROM lh_push_subscriptions WHERE id = ? AND endpoint_hash = ? AND auth_token = ?'
        );
        $statement->execute([$id, hash('sha256', $endpoint), $authToken]);
    }
}
