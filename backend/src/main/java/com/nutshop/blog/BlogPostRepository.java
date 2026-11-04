package com.nutshop.blog;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BlogPostRepository extends JpaRepository<BlogPost, Long> {

	Optional<BlogPost> findBySlug(String slug);

	Page<BlogPost> findByStatusOrderByPublishedAtDescIdDesc(BlogPost.Status status, Pageable page);

	/** The newest published posts other than {@code excludeId}. */
	@Query("SELECT p FROM BlogPost p WHERE p.status = com.nutshop.blog.BlogPost.Status.PUBLISHED AND p.id <> :excludeId"
			+ " ORDER BY p.publishedAt DESC, p.id DESC")
	List<BlogPost> findLatestExcept(@Param("excludeId") Long excludeId, Pageable page);

	Page<BlogPost> findAll(Specification<BlogPost> spec, Pageable pageable);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("SELECT p FROM BlogPost p WHERE p.id = :id")
	Optional<BlogPost> lockById(@Param("id") Long id);
}
