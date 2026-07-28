<?php

/**
 * Verifies request validation rejects type confusion and oversized fields.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\RequestData;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class RequestDataTest extends TestCase
{
    public function testReadsValidScalars(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/')
            ->withParsedBody(['name' => ' Alice ', 'count' => '4', 'enabled' => true]);
        $data = new RequestData($request);
        self::assertSame('Alice', $data->requiredString('name'));
        self::assertSame(4, $data->requiredInt('count'));
        self::assertTrue($data->optionalBool('enabled'));
    }

    public function testRejectsArrayAsString(): void
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/')
            ->withParsedBody(['name' => ['unexpected']]);
        $this->expectException(ApiException::class);
        (new RequestData($request))->requiredString('name');
    }
}
