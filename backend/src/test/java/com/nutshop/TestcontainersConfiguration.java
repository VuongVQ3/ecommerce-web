package com.nutshop;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Integration tests run against a real PostgreSQL (Docker must be running), so they catch SQL that only fails on
 * PostgreSQL. One container is shared by every Spring test context in the JVM.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgres() {
		return POSTGRES;
	}
}
