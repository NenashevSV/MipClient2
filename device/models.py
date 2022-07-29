from django.db import models

class Device(models.Model):
	device_id = models.CharField(max_length=10)


class Commands(models.Model):
	device = models.ForeignKey(Device, on_delete=models.CASCADE)
	command_text = models.CharField(max_length=250)
