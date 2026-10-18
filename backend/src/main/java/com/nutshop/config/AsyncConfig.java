package com.nutshop.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/** Runs @Async methods on Spring Boot's applicationTaskExecutor. */
@Configuration(proxyBeanMethods = false)
@EnableAsync
public class AsyncConfig {
}
