from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.challenges.models import Challenge, ChallengeSnapshot

User = get_user_model()


class ChallengeSnapshotTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass123456789", is_staff=True)
        self.challenge = Challenge.objects.create(
            title="Chal", slug="chal", description="desc", flag_hmac="x" * 64, points_max=500
        )

    def test_admin_snapshot_creation(self):
        self.client.login(username="admin", password="pass123456789")
        resp = self.client.post(f"/api/admin/challenges/{self.challenge.id}/snapshot", {"reason": "freeze"})
        self.assertEqual(resp.status_code, 201)
        snap = ChallengeSnapshot.objects.filter(challenge=self.challenge).first()
        self.assertIsNotNone(snap)
        self.assertEqual(snap.reason, ChallengeSnapshot.REASON_FREEZE)
        self.assertEqual(snap.title, self.challenge.title)