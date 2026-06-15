from cache.embedding_cache import (
    cache_stats,
    get_cached_embedding,
    set_cached_embedding,
)


def test_embed_cache_hit():
    set_cached_embedding("user-1", "What did we discuss?", [0.1, 0.2])
    hit = get_cached_embedding("user-1", "what did we discuss?")
    assert hit == [0.1, 0.2]
    stats = cache_stats()
    assert stats["hits"] >= 1


def test_embed_cache_miss_different_user():
    set_cached_embedding("user-1", "hello", [1.0])
    assert get_cached_embedding("user-2", "hello") is None
