from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.core.models import Team, Membership, ScoreEvent
from apps.challenges.models import Challenge
from apps.content.models import WriteUp

User = get_user_model()


class WriteUpModerationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u1", password="pass123456789")
        self.staff = User.objects.create_user(username="staff", password="pass123456789", is_staff=True, is_superuser=True)
        self.team = Team.objects.create(name="Team A", slug="team-a", captain=self.user)
        Membership.objects.create(user=self.user, team=self.team, role=Membership.ROLE_CAPTAIN)
        self.challenge = Challenge.objects.create(
            title="Chal", slug="chal", description="desc", flag_hmac="x" * 64, points_max=500
        )

    def test_submit_and_approve_writeup_awards_bonus(self):
        # Login as normal user
        self.client.login(username="u1", password="pass123456789")

        # Submit write-up
        resp = self.client.post(
            "/api/content/challenges/%d/writeups" % self.challenge.id,
            {"title": "My writeup", "content_md": "Steps..."},
        )
        self.assertEqual(resp.status_code, 201)
        wid = resp.json()["id"]

        # Approve as staff
        self.client.logout()
        self.client.login(username="staff", password="pass123456789")
        resp2 = self.client.post(
            "/api/content/writeups/%d/moderate" % wid,
            {"action": "approve", "notes": "good"},
        )
        self.assertEqual(resp2.status_code, 200)

        # Verify writeup status and bonus event
        w = WriteUp.objects.get(id=wid)
        self.assertEqual(w.status, WriteUp.STATUS_APPROVED)
        bonus = ScoreEvent.objects.filter(team=self.team, type=ScoreEvent.TYPE_WRITEUP_BONUS).first()
        self.assertIsNotNone(bonus)
        self.assertEqual(bonus.challenge_id, self.challenge.id)

    def test_admin_list_pending_requires_staff(self):
        # Anonymous cannot list
        resp = self.client.get("/api/content/writeups?status=pending")
        self.assertEqual(resp.status_code, 403)

        # Login as staff and list pending
        self.client.login(username="staff", password="pass123456789")
        resp2 = self.client.get("/api/content/writeups?status=pending")
        self.assertEqual(resp2.status_code, 200)
        self.assertIn("results", resp2.json())