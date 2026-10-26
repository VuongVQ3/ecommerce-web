package com.nutshop.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Runs @Async methods on Spring Boot's applicationTaskExecutor, and @Scheduled sweeps (e.g. stale-PENDING expiry). */
@Configuration(proxyBeanMethods = false)
@EnableAsync
@EnableScheduling
public class AsyncConfig {
}
