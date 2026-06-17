from orchestration.image_intent import classify_image_intent


def test_generate_image_intent():
    assert classify_image_intent("generate an image of a sunset") == "image"
    assert classify_image_intent("generate a peter pan image") == "image"
    assert classify_image_intent("draw me a cat wearing a hat") == "image"


def test_edit_image_intent_requires_attachment():
    assert classify_image_intent("make the sky purple", has_image_attachment=True) == "image_edit"
    assert classify_image_intent("make the sky purple", has_image_attachment=False) is None


def test_analyze_not_generation():
    assert classify_image_intent("describe this image") is None


def test_email_reply_not_image_generation():
    assert classify_image_intent("generate an email reply") is None
    assert classify_image_intent("create a draft reply to John") is None
    assert classify_image_intent("compose an email for the invoice") is None
